// ============================================================
// SpotHire Radar Demo：地图招聘 & 人才雷达小程序
// ============================================================
// 这是一个纯前端静态 Demo，核心目标是用最小依赖实现一个可演示的产品原型：
// 1）在地图上展示岗位与人才的地理位置；
// 2）支持身份切换（求职者 / 招聘方）；
// 3）支持距离过滤（1 / 3 / 5 公里）；
// 4）支持 AI 匹配（按简历关键词给出 Top 3 推荐）；
// 5）对部署友好，能直接上传到 Vercel 作为静态页面运行。
//
// 本文件使用 JavaScript 原生语法编写，不依赖后端服务；
// 若未来接入真实大模型，建议把 `fetchAIRecommendation` 这段替换为 HTTP 请求即可，
// 当前默认走本地规则引擎，保证 Demo 一键启动、无需账号和 API Key。
// ============================================================

(() => {
  // -------------------------
  // 1. 全局配置：中心点与数据范围
  // -------------------------
  // 北京国贸，作为 Demo 的中心地理坐标。
  // 说明：在真实业务里，这个中心通常来自用户当前 GPS 或企业总部位置。
  let CENTER_POINT = {
    lat: 39.914, 
    lng: 116.455,
    name: '北京国贸',
  };

  // 默认选中的角色：求职者模式展示岗位，招聘方模式展示人才。
  let selectedRole = 'jobseeker';

  // 默认距离筛选：3 公里。
  // 用户可以通过滑块或数字输入框调整 0.1-5 公里的任意距离。
  let selectedDistanceKm = 3;

  // 统一状态筛选：用于“招聘工作台”看板中筛选当前候选人的阶段。
  let selectedStatus = 'all';

  // 薪酬区间的默认值：为真实招聘看板增加必要的筛选条件。
  // 在真实产品里，这通常和岗位最低薪资、候选人薪资要求进行双向校验。
  let salaryFilter = {
    min: 10,
    max: 60,
  };

  // 求职意愿 / 可入职状态：这是生产场景中常见的真实字段，避免“仅看技能”带来的误判。
  let availabilityFilter = 'all';

  // 推广“AI 推荐”的结果 ID 集合，用于给推荐点标上金色高亮。
  let recommendedIds = new Set();

  // 存储所有模拟数据：岗位 & 人才。注意：这是前端 Mock 数据，不代表真实招聘库。
  const mockData = {
    jobs: [],
    talents: [],
  };

  // 地图和图层引用，后面初始化时会填充。
  let map;
  let markerLayer;
  let radarCircleLayer;
  let allMarkers = [];
  let selectedRecord = null;
  let selectedProfileTab = 'portrait';

  const LOCATION_PRESETS = {
    '北京国贸': { lat: 39.914, lng: 116.455, name: '北京国贸' },
    '北京CBD': { lat: 39.914, lng: 116.455, name: '北京CBD' },
    '上海陆家嘴': { lat: 31.239, lng: 121.499, name: '上海陆家嘴' },
    '上海静安': { lat: 31.229, lng: 121.457, name: '上海静安' },
    '深圳湾区': { lat: 22.536, lng: 113.949, name: '深圳湾区' },
    '深圳福田': { lat: 22.543, lng: 114.057, name: '深圳福田' },
    '广州珠江新城': { lat: 23.123, lng: 113.323, name: '广州珠江新城' },
    '成都天府': { lat: 30.572, lng: 104.066, name: '成都天府' },
  };

  // -------------------------
  // 2. 关键词字典：用于简历 / 岗位匹配
  // -------------------------
  // 这里并不是纯堆 “AI 关键字”，而是产品中的“技能标签词典”；
  // 实际业务里建议用统一词典维护，保证沃特使用一致的技能口径。
  const SKILL_LIBRARY = [
    'ai', '大模型', 'llm', '产品经理', '产品', '运营', '增长', '数据分析', '数据',
    'java', 'python', 'javascript', '前端', 'vue', 'react', 'node', '后端', '算法',
    '运营', '市场', '销售', '商务', '设计', 'ui', 'ux', '人工智能', '机器学习',
    '数据同步', '用户研究', '商业化', '战略', '项目管理', '架构', '云', 'aws',
    'k8s', 'devops', '测试', 'qa', 'pm', '招聘', '猎头', 'hr', '客服', '供应链',
  ];

  // -------------------------
  // 3. Mock 数据生成：随机 LBS 数据
  // -------------------------
  // SpotCrime 成功的核心，不在地图，而在“数据工程”：标准化 + 归一化 + 去重 + 时点标注。
  // 同理，本 Demo 通过随机生成不同经纬度，模拟真实周边招聘与人才分布。
  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // 随机偏移坐标：按照极坐标随机生成距离中心点 radiusKm 以内的坐标。
  function randomPointNearCenter(centerLat, centerLng, radiusKm) {
    const radiusMeters = radiusKm * 1000;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radiusMeters;

    const earthRadius = 6371000;
    const deltaLat = (distance * Math.cos(angle)) / earthRadius * (180 / Math.PI);
    const deltaLng = (distance * Math.sin(angle)) / earthRadius * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);

    return {
      lat: centerLat + deltaLat,
      lng: centerLng + deltaLng,
    };
  }

  // 计算两个坐标之间的实际距离（KM）。
  function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }

  // 统一格式化薪酬展示：简化运营层理解，有时也可用于校验薪酬区间。
  function formatSalary(min, max) {
    return `${min}k-${max}k/月`;
  }

  // 简历输入或岗位描述标准化：去空格、小写、中文保留，便于做词匹配。
  function normalizeText(text = '') {
    return String(text)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[：:；;，,。.!？?]/g, '');
  }

  // 多源标准化元数据：关键点是“带时点 + 带口径”。
  // 这和 SpotCrime 的数据工程思路完全一致：
  // - sourceType：来源渠道，例如 ATS / 招聘平台 / 内推 / 猎头 / 校招
  // - collectedAt：采集时间，保证能回溯数据有效性与时效
  // - schemaVersion：字段口径版本，避免不同来源同名字段含义不一致
  // - normalizedAt：归一化时间，便于后续去重和版本管理
  // - dataWindow：统计口径，例如“近 30 天”或 “近 90 天”，避免跨口径比较失真
  function buildSourceMeta({ sourceType, sourceName, capturedAt, index = 0 }) {
    const now = new Date();
    const collectedAt = capturedAt || new Date(now.getTime() - (index % 8) * 86400000).toISOString();
    return {
      sourceType,
      sourceName,
      collectedAt,
      schemaVersion: 'v1.2',
      normalizedAt: now.toISOString(),
      dataWindow: '近 30 天',
      dedupeStatus: '已去重并归并',
    };
  }

  // 构造标准化字段：把不同来源的岗位 / 候选人统一成同一口径，
  // 这样后续既能做地图聚合，也能做推荐、筛选和去重。
  function standardizeRecord(record, fallbackType) {
    const skills = Array.isArray(record.skills) ? record.skills.map((item) => String(item).trim()) : [];
    const salaryMin = Number(record.salaryMin ?? record.salary?.split('-')[0]?.replace(/[^0-9]/g, '') ?? 0);
    const salaryMax = Number(record.salaryMax ?? record.salary?.split('-')[1]?.replace(/[^0-9]/g, '') ?? salaryMin);
    const yearsOfExperience = Number(Number(record.yearsOfExperience ?? Math.max(1, (salaryMin || 12) / 10)).toFixed(1));

    return {
      ...record,
      type: record.type || fallbackType,
      skills,
      salaryMin: Number.isFinite(salaryMin) ? salaryMin : 0,
      salaryMax: Number.isFinite(salaryMax) ? salaryMax : salaryMin,
      yearsOfExperience,
      sourceMeta: record.sourceMeta || buildSourceMeta({
        sourceType: 'ATS',
        sourceName: '统一归档',
        capturedAt: new Date().toISOString(),
      }),
      dedupeKey: record.dedupeKey || `${record.id || 'record'}-${record.title || record.name || 'unknown'}-${record.sourceMeta?.sourceType || 'ATS'}`,
    };
  }

  // 构造岗位数据：50 条，包含经纬度、薪酬、技能标签、距离等字段。
  // 这里补充了真实招聘场景中的关键字段：jobWillingness（求职意愿/到岗效率）和 interviewFeedback（历史沟通面试反馈），
  // 这是产品在实际场景里非常重要的决策信号，避免“只看技能不看匹配度”。
  function generateJobs() {
    const jobTitles = [
      'AI产品经理', '前端工程师', 'Java后端工程师', 'Python数据分析师', '运营经理',
      '增长营销专员', '产品运营', 'AI算法工程师', '大模型应用工程师', 'Java架构师',
      'UI设计师', '数据产品经理', '招聘顾问', '客户成功经理', '供应链专员',
      'HRBP', '销售经理', '算法工程师', '数据开发工程师', '全栈工程师',
    ];

    const companies = [
      '链家', '美团', '字节跳动', '阿里云', '腾讯', '京东', '百度', '携程',
      '滴滴', '网易', '小米', '华为', '百度地图', '极兔', '旷视', '商汤', '爱奇艺',
    ];

    const skillSets = [
      ['AI', '产品经理', '商业化'],
      ['前端', 'Vue', 'React', 'JavaScript'],
      ['Java', '后端', '微服务'],
      ['Python', '数据分析', 'SQL'],
      ['运营', '增长', '用户研究'],
      ['AI', '大模型', 'Python'],
      ['Java', '架构', '云'],
      ['UI', 'UX', '设计'],
      ['招聘', 'HRBP', '面试'],
      ['销售', '客户管理', '商务'],
    ];

    return Array.from({ length: 50 }, (_, index) => {
      const point = randomPointNearCenter(CENTER_POINT.lat, CENTER_POINT.lng, 5);
      const title = jobTitles[index % jobTitles.length];
      const skillGroup = skillSets[index % skillSets.length];
      const salaryMin = 10 + (index % 10) * 5;
      const salaryMax = salaryMin + 8 + (index % 5) * 2;
      const distanceKm = calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, point.lat, point.lng);

      const recruiterName = ['张老师', '李经理', '王主管', '陈HR', '赵顾问'][index % 5];
      const recruiterPhone = `138${String(10000000 + index * 137).slice(0, 8)}`;
      const recruiterEmail = `recruit${index + 1}@${companies[index % companies.length].slice(0, 3).toLowerCase()}-job.com`;
      const sourceType = ['ATS', '招聘平台', '猎头', '内推', '校招'][index % 5];
      const companyBenefitsOptions = [
        ['五险一金', '弹性工作', '年终奖'],
        ['带薪年假', '股权激励', '补充医疗'],
        ['双休', '餐补', '团队氛围'],
        ['期权', '商业保险', '学习补贴'],
      ];
      const companyBenefits = companyBenefitsOptions[index % companyBenefitsOptions.length];
      const hiringPulseDays = 1 + (index % 9);
      const sourceRecords = [
        {
          sourceType: 'ATS',
          sourceName: '内部 ATS',
          capturedAt: new Date(Date.now() - (index % 5) * 86400000).toISOString(),
          schemaVersion: 'v1.2',
        },
        {
          sourceType: '招聘平台',
          sourceName: '招聘平台同步',
          capturedAt: new Date(Date.now() - (index % 7 + 1) * 86400000).toISOString(),
          schemaVersion: 'v1.2',
        },
      ];

      const record = {
        id: `job-${index + 1}`,
        type: 'job',
        lat: point.lat,
        lng: point.lng,
        title,
        company: companies[index % companies.length],
        salaryMin,
        salaryMax,
        salary: formatSalary(salaryMin, salaryMax),
        skills: skillGroup,
        industry: title.includes('AI') || title.includes('数据') ? '科技/AI' : '互联网/运营',
        distanceKm: Number(distanceKm.toFixed(2)),
        urgency: index % 4 === 0 ? '急聘' : '正常',
        source: sourceType,
        companyBenefits,
        hiringPulseDays,
        publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
        jobWillingness: '可立即入职',
        interviewFeedback: ['岗位匹配度高', '弹性工作制', '团队氛围好'],
        recruiter: {
          name: recruiterName,
          phone: recruiterPhone,
          email: recruiterEmail,
          position: '招聘负责人',
        },
        jobSummary: `${title}岗位面向 ${skillGroup.slice(0, 2).join(' / ')} 方向，适合 1-3 年相关经验候选人，支持弹性工作和高成长同行。`,
        sourceRecords,
        sourceMeta: buildSourceMeta({
          sourceType,
          sourceName: `${sourceType}归档`,
          capturedAt: sourceRecords[0].capturedAt,
          index,
        }),
      };

      return standardizeRecord(record, 'job');
    });
  }

  // 构造人才数据：50 条，包含技能标签、薪资期望、求职状态、沟通反馈。
  // 此处补充候选人档案的关键字段，模拟真实招聘工作台：
  // - candidateStatus：候选人状态，例如 待联系 / 已查看 / 面试中 / offer
  // - sourceChannels：多渠道来源（猎头、社媒、推荐、官网）
  // - dedupKey：用于排重的候选人唯一标识
  // - lastContact：最近沟通时间和摘要，接近真实 ATS / CRM 看板行为
  function generateTalents() {
    const names = ['王晨', '李然', '赵嵩', '周力', '林警', '陈静', '刘岑', '范佳', '许昊', '沈悦'];
    const titles = [
      'AI产品经理', '前端工程师', 'Java后端工程师', '运维工程师', '增长运营',
      '数据分析师', '大模型应用工程师', '算法工程师', '设计师', 'HRBP',
      '销售经理', '全栈工程师', '客户端工程师', '产品运营', '校招负责人',
    ];

    const skillSets = [
      ['AI', '产品经理', '增长'],
      ['前端', 'React', 'JavaScript'],
      ['Java', '后端', 'Spring'],
      ['Python', '数据分析', 'SQL'],
      ['运营', '增长', '用户研究'],
      ['AI', '大模型', 'Python'],
      ['算法', 'Python', '机器学习'],
      ['设计', 'UI', 'UX'],
      ['招聘', 'HRBP', '面试'],
      ['销售', '商务', '客户管理'],
    ];

    const statuses = ['待联系', '已查看', '已回复', '面试中', 'offer'];
    const channels = ['猎头', '内推', '社媒', '官网', '推荐'];

    return Array.from({ length: 50 }, (_, index) => {
      const point = randomPointNearCenter(CENTER_POINT.lat, CENTER_POINT.lng, 5);
      const title = titles[index % titles.length];
      const skillGroup = skillSets[index % skillSets.length];
      const salaryMin = 10 + (index % 8) * 4;
      const salaryMax = salaryMin + 8 + (index % 4) * 3;
      const distanceKm = calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, point.lat, point.lng);
      const status = statuses[index % statuses.length];
      const channel = channels[index % channels.length];
      const replyRate = 0.45 + (index % 6) * 0.08;
      const commuteTolerance = 15 + (index % 4) * 5;
      const hasNegativeSignal = index % 9 === 0;
      const recentRejectWindowDays = hasNegativeSignal ? 30 + (index % 5) * 12 : null;
      const lastInterviewAt = index % 6 === 0 ? new Date(Date.now() - 60 * 86400000).toISOString() : null;
      const lastInterviewResult = index % 6 === 0 ? '未通过' : '待定';

      const phone = `186${String(10000000 + index * 173).slice(0, 8)}`;
      const email = `${names[index % names.length].slice(0, 2).toLowerCase()}${index + 1}@mail.com`;
      const resumeSummary = `${title}候选人，拥有 ${Math.min(8, 2 + (index % 6))} 年相关经验，熟悉 ${skillGroup.slice(0, 2).join(' / ')}，具备从 0 到 1 产品与运营协同能力，擅长跨团队沟通与落地。`;
      const sourceTypes = ['ATS', '招聘平台', '内推', '猎头', '校招'];
      const sourceRecords = [
        {
          sourceType: 'ATS',
          sourceName: 'ATS 投递归档',
          capturedAt: new Date(Date.now() - (index % 3 + 1) * 86400000).toISOString(),
          schemaVersion: 'v1.2',
        },
        {
          sourceType: '社媒',
          sourceName: '社媒个人主页',
          capturedAt: new Date(Date.now() - (index % 5 + 2) * 86400000).toISOString(),
          schemaVersion: 'v1.2',
        },
      ];

      const record = {
        id: `talent-${index + 1}`,
        type: 'talent',
        lat: point.lat,
        lng: point.lng,
        name: names[index % names.length],
        title,
        company: index % 3 === 0 ? '当前在职' : '自由职业者',
        salaryMin,
        salaryMax,
        salary: `期望 ${salaryMin}k-${salaryMax}k/月`,
        skills: skillGroup,
        distanceKm: Number(distanceKm.toFixed(2)),
        availability: index % 2 === 0 ? '在职，考虑机会' : '待业中',
        source: channel,
        sourceChannels: [channel, '简历库', '社媒'],
        candidateStatus: status,
        dedupKey: `${names[index % names.length]}-${title}-${channel}`,
        lastContact: new Date(Date.now() - index * 86400000).toISOString(),
        contactSummary: index % 2 === 0 ? '沟通符合岗位预期，建议继续推进初筛' : '已安排技术面试，待反馈',
        publishedAt: new Date(Date.now() - index * 7200000).toISOString(),
        jobWillingness: index % 2 === 0 ? '可接洽' : '求职中',
        interviewFeedback: ['沟通能力强', '项目经验丰富', '适合高压环境'],
        replyRate,
        commuteTolerance,
        hasNegativeSignal,
        recentRejectWindowDays,
        lastInterviewAt,
        lastInterviewResult,
        contact: {
          phone,
          email,
          wechat: `wx_${names[index % names.length].toLowerCase()}`,
          portfolio: 'portfolio.example.com/' + names[index % names.length].toLowerCase(),
        },
        resumeSummary,
        sourceRecords,
        sourceMeta: buildSourceMeta({
          sourceType: sourceTypes[index % sourceTypes.length],
          sourceName: `${channel}归档`,
          capturedAt: sourceRecords[0].capturedAt,
          index,
        }),
      };

      return standardizeRecord(record, 'talent');
    });
  }

  // 数据治理：统一汇总来源、口径、去重与时效信息
  function buildGovernanceSummary() {
    const allRecords = [...mockData.jobs, ...mockData.talents];
    const sourceTypes = new Set(allRecords.map((item) => item.sourceMeta?.sourceType || item.source || '未知').filter(Boolean));
    const staleCount = allRecords.filter((item) => {
      const collectedAt = new Date(item.sourceMeta?.collectedAt || item.publishedAt || item.lastContact || Date.now());
      return Date.now() - collectedAt.getTime() > 30 * 86400000;
    }).length;
    const multiSourceCount = allRecords.filter((item) => (item.sourceRecords || []).length > 1).length;
    const duplicateCandidates = Array.from(new Map(
      mockData.talents.map((item) => [item.dedupeKey || item.id, item])
    ).values()).filter((item) => item.sourceChannels && item.sourceChannels.length > 1).length;

    return {
      totalRecords: allRecords.length,
      sourceTypeCount: sourceTypes.size,
      staleCount,
      multiSourceCount,
      duplicateCandidates,
      schemaVersion: 'v1.2',
      dataWindow: '近 30 天',
    };
  }

  function buildGovernanceDetails() {
    const sourceMap = new Map();

    [...mockData.jobs, ...mockData.talents].forEach((record) => {
      const sourceType = record.sourceMeta?.sourceType || record.source || '未知';
      const bucket = sourceMap.get(sourceType) || {
        sourceType,
        count: 0,
        stale: 0,
        coverage: {
          skills: 0,
          salary: 0,
          source: 0,
          time: 0,
        },
      };

      bucket.count += 1;
      const collectedAt = new Date(record.sourceMeta?.collectedAt || record.publishedAt || record.lastContact || Date.now());
      if (Date.now() - collectedAt.getTime() > 30 * 86400000) bucket.stale += 1;
      if (Array.isArray(record.skills) && record.skills.length) bucket.coverage.skills += 1;
      if (record.salaryMin || record.salaryMax || record.salary) bucket.coverage.salary += 1;
      if (record.source || record.sourceMeta) bucket.coverage.source += 1;
      if (record.sourceMeta?.collectedAt || record.publishedAt || record.lastContact) bucket.coverage.time += 1;
      sourceMap.set(sourceType, bucket);
    });

    return Array.from(sourceMap.values()).map((item) => ({
      ...item,
      fieldCoverage: `${Math.round(((item.coverage.skills + item.coverage.salary + item.coverage.source + item.coverage.time) / 4) / item.count * 100)}%`,
      attention: item.stale > 0 ? '需补齐/更新' : '正常',
    }));
  }

  function buildSchemaMatrix() {
    const fieldDefs = [
      { key: 'skills', label: '技能标签' },
      { key: 'salary', label: '薪资区间' },
      { key: 'experience', label: '工作年限' },
      { key: 'source', label: '来源渠道' },
      { key: 'time', label: '采集时间' },
      { key: 'version', label: 'Schema版本' },
      { key: 'location', label: '地理位置' },
      { key: 'contact', label: '联系信息' },
    ];

    const sourceNames = ['ATS', '招聘平台', '内推', '猎头', '校招'];
    const rows = fieldDefs.map((field) => {
      const coverage = sourceNames.map((source) => {
        const records = [...mockData.jobs, ...mockData.talents].filter((item) => (item.sourceMeta?.sourceType || item.source || '未知') === source);
        const count = records.length;
        const filled = records.filter((record) => {
          if (field.key === 'skills') return Array.isArray(record.skills) && record.skills.length > 0;
          if (field.key === 'salary') return !!(record.salaryMin || record.salaryMax || record.salary);
          if (field.key === 'experience') return !!(record.yearsOfExperience || record.salaryMin);
          if (field.key === 'source') return !!(record.source || record.sourceMeta || record.sourceChannels);
          if (field.key === 'time') return !!(record.sourceMeta?.collectedAt || record.publishedAt || record.lastContact);
          if (field.key === 'version') return !!record.sourceMeta?.schemaVersion;
          if (field.key === 'location') return Number.isFinite(record.lat) && Number.isFinite(record.lng);
          if (field.key === 'contact') return !!(record.contact?.phone || record.contact?.email || record.recruiter?.phone);
          return false;
        }).length;
        const pct = count ? Math.round((filled / count) * 100) : 0;
        return { source, pct };
      });

      return { field: field.label, coverage };
    });

    return { rows, sourceNames };
  }

  function buildGovernanceInsights() {
    const sourceStats = buildGovernanceDetails();
    return sourceStats.map((row) => {
      const issues = [];
      if (row.stale > 0) issues.push('存在过期数据，需补齐采集时间');
      if (Number.parseInt(row.fieldCoverage, 10) < 80) issues.push('关键字段覆盖率偏低，需统一字段口径');
      if (row.attention === '需补齐/更新') issues.push('建议使用最新 schema 重新归一化');

      return {
        sourceType: row.sourceType,
        issues: issues.length ? issues : ['口径稳定，近期无明显治理风险'],
      };
    });
  }

  function renderGovernanceSummary() {
    const healthContainer = document.getElementById('dataGovernanceHealth');
    const summaryContainer = document.getElementById('dataGovernanceSummary');
    const tableContainer = document.getElementById('dataGovernanceTable');
    const schemaMatrixContainer = document.getElementById('dataSchemaMatrix');
    const insightsContainer = document.getElementById('dataGovernanceInsights');
    if (!healthContainer || !summaryContainer || !tableContainer || !schemaMatrixContainer || !insightsContainer) return;

    const summary = buildGovernanceSummary();
    const avgCoverage = Math.round(
      buildGovernanceDetails().reduce((acc, row) => acc + Number.parseInt(row.fieldCoverage, 10), 0) /
      Math.max(buildGovernanceDetails().length, 1)
    );
    const healthState = avgCoverage >= 80 ? '健康' : avgCoverage >= 60 ? '待改善' : '需治理';
    const healthColor = avgCoverage >= 80 ? 'text-emerald-200' : avgCoverage >= 60 ? 'text-amber-200' : 'text-rose-200';

    healthContainer.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">Data Health</div>
          <div class="mt-1 text-lg font-bold text-white">数据治理健康度：<span class="${healthColor}">${healthState}</span></div>
        </div>
        <div class="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-sm font-semibold text-slate-100">${avgCoverage}%</div>
      </div>
      <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" style="width: ${avgCoverage}%"></div>
      </div>
    `;

    const cards = [
      { label: '总记录', value: summary.totalRecords },
      { label: '来源口径', value: `${summary.sourceTypeCount}类` },
      { label: '多源归并', value: `${summary.multiSourceCount}条` },
      { label: '失效数据', value: `${summary.staleCount}条` },
      { label: '疑似重复', value: `${summary.duplicateCandidates}条` },
      { label: 'Schema', value: summary.schemaVersion },
    ];

    summaryContainer.innerHTML = cards.map((card) => `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
        <div class="text-[10px] uppercase tracking-[0.15em] text-slate-400">${card.label}</div>
        <div class="mt-2 text-xl font-bold text-white">${card.value}</div>
      </div>
    `).join('');

    const rows = buildGovernanceDetails();
    tableContainer.innerHTML = `
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-[11px] text-slate-200">
          <thead class="bg-slate-950/70 text-slate-400">
            <tr>
              <th class="px-3 py-2 font-medium">来源</th>
              <th class="px-3 py-2 font-medium">记录数</th>
              <th class="px-3 py-2 font-medium">关键字段覆盖</th>
              <th class="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="border-t border-slate-700/80">
                <td class="px-3 py-2 text-slate-100">${row.sourceType}</td>
                <td class="px-3 py-2">${row.count}</td>
                <td class="px-3 py-2 text-sky-300">${row.fieldCoverage}</td>
                <td class="px-3 py-2 ${row.attention === '需补齐/更新' ? 'text-amber-300' : 'text-emerald-300'}">${row.attention}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const schema = buildSchemaMatrix();
    schemaMatrixContainer.innerHTML = `
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-[11px] text-slate-200">
          <thead class="bg-slate-950/70 text-slate-400">
            <tr>
              <th class="px-3 py-2 font-medium">字段</th>
              ${schema.sourceNames.map((name) => `<th class="px-3 py-2 font-medium">${name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${schema.rows.map((row) => `
              <tr class="border-t border-slate-700/80">
                <td class="px-3 py-2 text-slate-100">${row.field}</td>
                ${row.coverage.map((cell) => `
                  <td class="px-3 py-2 ${cell.pct >= 85 ? 'text-emerald-300' : cell.pct >= 60 ? 'text-amber-300' : 'text-rose-300'}">${cell.pct}%</td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const insights = buildGovernanceInsights();
    insightsContainer.innerHTML = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
        <div class="mb-2 text-[10px] uppercase tracking-[0.15em] text-slate-400">治理建议</div>
        <div class="space-y-2">
          ${insights.map((item) => `
            <div class="rounded-xl border border-slate-700 bg-slate-950/70 p-2">
              <div class="mb-1 font-medium text-slate-100">${item.sourceType}</div>
              <ul class="list-disc space-y-1 pl-4 text-[11px] text-slate-300">
                ${item.issues.map((issue) => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 统一入口：创建 Mock 数据，避免在前端直接硬编码过多信息。
  function initializeData() {
    mockData.jobs = generateJobs();
    mockData.talents = generateTalents();
    renderGovernanceSummary();
  }

  // -------------------------
  // 4. 地图初始化与渲染
  // -------------------------
  function initMap() {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([CENTER_POINT.lat, CENTER_POINT.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap 贡献者',
      maxZoom: 19,
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    radarCircleLayer = L.layerGroup().addTo(map);

    renderHeatZones();
    renderMapData();
  }

  // 展示“覆盖半径”区域：模拟热力图/雷达扫描感，便于产品理解“地图围栏”的概念。
  function renderHeatZones() {
    radarCircleLayer.clearLayers();

    const color = selectedRole === 'jobseeker' ? '#38bdf8' : '#f59e0b';
    const circleRadius = selectedDistanceKm * 1000;

    const glowCircle = L.circle([CENTER_POINT.lat, CENTER_POINT.lng], {
      radius: circleRadius,
      color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 1.5,
      opacity: 0.8,
    }).addTo(radarCircleLayer);

    const outerRing = L.circle([CENTER_POINT.lat, CENTER_POINT.lng], {
      radius: Math.min(circleRadius + 900, 5000),
      color: '#94a3b8',
      fill: false,
      weight: 1,
      dashArray: '6 8',
      opacity: 0.45,
    }).addTo(radarCircleLayer);

    map.fitBounds(glowCircle.getBounds().pad(0.35));
  }

  // 每个 Marker 由自定义 divIcon 生成，颜色区分岗位 / 人才；
  // 如果被 AI 推荐，则用金色边框高亮，强调“Top 3”。
  function createMarkerIcon(record) {
    const isRecommended = recommendedIds.has(record.id);
    const baseColor = record.type === 'job' ? '#38bdf8' : '#f59e0b';
    const accentColor = isRecommended ? '#fbbf24' : baseColor;

    const html = `
      <div style="position: relative; width: 18px; height: 18px;">
        <div style="position:absolute; inset:0; border-radius:50%; background:${accentColor}; box-shadow: 0 0 0 3px rgba(255,255,255,0.12), 0 14px 18px rgba(0,0,0,0.18);"></div>
        ${isRecommended ? '<div style="position:absolute; inset:-5px; border:2px solid rgba(251,191,36,0.9); border-radius:50%;"></div>' : ''}
      </div>
    `;

    return L.divIcon({
      className: 'custom-pin',
      html,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    });
  }

  // 弹窗内容：用于展示岗位或人才图钉详细信息，体现产品中的“简报卡片”形态。
  function buildPopupHtml(record) {
    if (record.type === 'job') {
      return `
        <div style="width:240px; padding: 10px 12px 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="background: rgba(56,189,248,0.12); color:#7dd3fc; border:1px solid rgba(56,189,248,0.25); border-radius:999px; padding:4px 8px; font-size:11px; font-weight:700;">急聘岗位</span>
            <span style="font-size:11px; color:#cbd5e1;">${record.distanceKm}km</span>
          </div>
          <div style="font-size:16px; font-weight:700; color:#f8fafc; margin-bottom:6px;">${record.title}</div>
          <div style="color:#cbd5e1; font-size:12px; margin-bottom:4px;">${record.company}</div>
          <div style="color:#fbbf24; font-weight:700; font-size:15px; margin-bottom:8px;">${record.salary}</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            ${record.skills.map((skill) => `<span style="background: rgba(148,163,184,0.12); color:#e2e8f0; border:1px solid rgba(148,163,184,0.18); border-radius:999px; padding:3px 7px; font-size:10px;">${skill}</span>`).join('')}
          </div>
          <div style="font-size:11px; line-height:1.5; color:#cbd5e1;">
            <div>岗位来源：${record.source}</div>
            <div>数据口径：${record.sourceMeta?.schemaVersion || 'v1.2'} / ${record.sourceMeta?.dataWindow || '近 30 天'}</div>
            <div>采集时间：${new Date(record.sourceMeta?.collectedAt || record.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div>多源归并：${(record.sourceRecords || []).map((item) => item.sourceType).slice(0, 2).join(' / ') || 'ATS / 招聘平台'}</div>
            <div>经验深度：${record.yearsOfExperience.toFixed(1)} 年</div>
            <div>求职意愿：${record.jobWillingness}</div>
            <div>联系人：${record.recruiter.name} / ${record.recruiter.phone}</div>
            <div>邮箱：${record.recruiter.email}</div>
            <div>薪资校验：${record.salaryMin}k-${record.salaryMax}k</div>
            <div>岗位简介：${record.jobSummary}</div>
            <div>历史反馈：${record.interviewFeedback.slice(0, 2).join(' / ')}</div>
          </div>
        </div>
      `;
    }

    return `
      <div style="width:240px; padding: 10px 12px 8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="background: rgba(245,158,11,0.12); color:#fdba74; border:1px solid rgba(245,158,11,0.28); border-radius:999px; padding:4px 8px; font-size:11px; font-weight:700;">活跃人才</span>
          <span style="font-size:11px; color:#cbd5e1;">${record.distanceKm}km</span>
        </div>
        <div style="font-size:16px; font-weight:700; color:#f8fafc; margin-bottom:6px;">${record.name}</div>
        <div style="color:#cbd5e1; font-size:12px; margin-bottom:4px;">${record.title} · ${record.company}</div>
        <div style="color:#fbbf24; font-weight:700; font-size:15px; margin-bottom:8px;">${record.salary}</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          ${record.skills.map((skill) => `<span style="background: rgba(148,163,184,0.12); color:#e2e8f0; border:1px solid rgba(148,163,184,0.18); border-radius:999px; padding:3px 7px; font-size:10px;">${skill}</span>`).join('')}
        </div>
        <div style="font-size:11px; line-height:1.5; color:#cbd5e1;">
          <div>候选人状态：${record.candidateStatus || '待联系'}</div>
          <div>经验深度：${record.yearsOfExperience.toFixed(1)} 年</div>
          <div>求职状态：${record.availability}</div>
          <div>求职意愿：${record.jobWillingness}</div>
          <div>数据口径：${record.sourceMeta?.schemaVersion || 'v1.2'} / ${record.sourceMeta?.dataWindow || '近 30 天'}</div>
          <div>采集时间：${new Date(record.sourceMeta?.collectedAt || record.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          <div>多源归并：${(record.sourceRecords || []).map((item) => item.sourceType).slice(0, 2).join(' / ') || 'ATS / 社媒'}</div>
          <div>联系方式：${record.contact.phone} / ${record.contact.email}</div>
          <div>微信：${record.contact.wechat}</div>
          <div>来源：${record.sourceChannels?.join(' / ') || record.source}</div>
          <div>去重键：${record.dedupKey}</div>
          <div>简历摘要：${record.resumeSummary}</div>
          <div>最近沟通：${record.contactSummary}</div>
          <div>历史反馈：${record.interviewFeedback.slice(0, 2).join(' / ')}</div>
        </div>
      </div>
    `;
  }

  // 薪酬区间校验：主要用于保护岗位和人才之间的双向匹配准确性。
  // 在真实产品中，一定要做上下界校验，避免 40k 岗位出现 20k 候选人的误导。
  function normalizeSalaryRange(record) {
    const min = Number(record.salaryMin ?? 0);
    const max = Number(record.salaryMax ?? min);
    return { min, max };
  }

  function isSalaryMatch(record) {
    const { min, max } = normalizeSalaryRange(record);
    const recordSalaryMax = Math.max(min, max);
    const recordSalaryMin = Math.min(min, max);

    const matchesMin = recordSalaryMin >= salaryFilter.min;
    const matchesMax = recordSalaryMax <= salaryFilter.max || salaryFilter.max >= 100;

    return matchesMin && matchesMax;
  }

  // 求职意愿 / 入职状态筛选：这是招聘场景关于“是否能够及时上岗”的重要判定维度。
  function isAvailabilityMatch(record) {
    if (availabilityFilter === 'all') return true;

    const text = `${record.jobWillingness || ''} ${record.availability || ''}`.toLowerCase();
    if (availabilityFilter === 'immediate') return text.includes('立即') || text.includes('可接洽') || text.includes('求职中');
    if (availabilityFilter === 'considering') return text.includes('考虑') || text.includes('在职');
    if (availabilityFilter === 'open') return text.includes('待业') || text.includes('求职中');
    return true;
  }

  // 过滤可视区域：按当前角色、距离、薪酬、求职状态和候选人状态做筛选。
  // 这是从“地图查看”升级到“看板决策”的关键逻辑，保证产品不是只会展示点位，而会筛出真正值得推进的对象。
  function getVisibleRecords() {
    const source = selectedRole === 'jobseeker' ? mockData.jobs : mockData.talents;
    return source.filter((record) => {
      const inDistance = calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, record.lat, record.lng) <= selectedDistanceKm;
      const inSalary = isSalaryMatch(record);
      const inAvailability = isAvailabilityMatch(record);
      const statusKey = record.candidateStatus || record.hiringStage || 'all';
      const inStatus = selectedStatus === 'all' || statusKey === selectedStatus || (!record.candidateStatus && !record.hiringStage && selectedRole === 'jobseeker');
      return inDistance && inSalary && inAvailability && inStatus;
    });
  }

  // 统计工作台速览：用于给招聘方或猎头提供一个更像 CRM 的运营视角。
  function renderWorkbenchStats() {
    const container = document.getElementById('workbenchStats');
    if (!container) return;

    const counts = {
      全部: mockData.talents.length,
      待联系: mockData.talents.filter((item) => item.candidateStatus === '待联系').length,
      已查看: mockData.talents.filter((item) => item.candidateStatus === '已查看').length,
      面试中: mockData.talents.filter((item) => item.candidateStatus === '面试中').length,
      offer: mockData.talents.filter((item) => item.candidateStatus === 'offer').length,
    };

    const reminders = typeof window.OutreachAssistant !== 'undefined'
      ? window.OutreachAssistant.buildFollowUpReminders(mockData.talents)
      : [];

    container.innerHTML = Object.entries(counts)
      .map(([label, value]) => `
        <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-2">
          <div class="text-[10px] uppercase tracking-[0.14em] text-slate-400">${label}</div>
          <div class="mt-2 text-xl font-bold text-white">${value}</div>
        </div>
      `)
      .join('') + `
        <div class="col-span-2 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-2">
          <div class="text-[10px] uppercase tracking-[0.14em] text-amber-200">未回复提醒</div>
          <div class="mt-2 text-lg font-bold text-amber-300">${reminders.length} 条</div>
        </div>
      `;
  }

  // 刷新主地图：清空旧图层并重新绘制。
  function renderMapData() {
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();
    allMarkers = [];

    const visibleRecords = getVisibleRecords();

    if (selectedRole === 'employer' && typeof window.TalentMapEngine !== 'undefined') {
      const gridLayer = window.TalentMapEngine.addGridOverlay(map, visibleRecords, { cellSize: 0.015, neighborRadius: 0.03 });
      if (gridLayer) {
        gridLayer.addTo(map);
      }
    }

    visibleRecords.forEach((record) => {
      const marker = L.marker([record.lat, record.lng], {
        icon: createMarkerIcon(record),
        title: record.title || record.name,
      }).bindPopup(buildPopupHtml(record), { closeButton: true, autoPan: true });

      marker.on('popupopen', () => {
        selectedRecord = record;
        if (record.type === 'talent') {
          record.candidateStatus = record.candidateStatus || '已查看';
          renderWorkbenchStats();
        }
        renderDetailDrawer();
      });

      // 如果该记录被推荐，则提高叠放层级，视觉上更突出。
      if (recommendedIds.has(record.id)) {
        marker.setZIndexOffset(1000);
      }

      marker.addTo(markerLayer);
      allMarkers.push(marker);
    });

    updateSummaryStats(visibleRecords);
    renderWorkbenchStats();
    if (!selectedRecord || !visibleRecords.some((item) => item.id === selectedRecord.id)) {
      selectedRecord = visibleRecords[0] || null;
    }
    renderDetailDrawer();
  }

  function ensureProfile(record) {
    if (!record) return null;
    if (!record.profile && window.ProfileSystem) {
      record.profile = window.ProfileSystem.createProfile(record);
    }
    return record.profile || null;
  }

  function renderProfilePanel() {
    const panel = document.getElementById('detailProfilePanel');
    if (!panel) return;
    if (!selectedRecord) {
      panel.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-800/60 p-2 text-slate-400">请选择对象查看档案</div>';
      return;
    }

    const profile = ensureProfile(selectedRecord);
    if (!profile) {
      panel.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-800/60 p-2 text-slate-400">暂无档案数据</div>';
      return;
    }

    const portrait = profile.portrait || {};
    const raw = profile.raw || {};
    const timeline = profile.timeline || [];

    const tabMap = {
      portrait: `
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-2.5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[10px] uppercase tracking-[0.15em] text-sky-300">画像层</span>
            <span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-100">置信度 ${portrait.confidence || 80}</span>
          </div>
          <div class="space-y-2 text-slate-200">
            <div><span class="text-slate-400">职位：</span> ${portrait.title || '未知'}</div>
            <div><span class="text-slate-400">年限：</span> ${portrait.yearsOfExperience || 3} 年</div>
            <div><span class="text-slate-400">状态：</span> ${portrait.candidateStatus || portrait.availability || '待定'}</div>
            <div><span class="text-slate-400">意愿：</span> ${portrait.willingness || '待评估'}</div>
            <div><span class="text-slate-400">来源：</span> ${(portrait.sourceChannels || []).slice(0, 2).join(' / ') || '未知来源'}</div>
            <div><span class="text-slate-400">数据口径：</span> ${selectedRecord?.sourceMeta?.schemaVersion || 'v1.2'} · ${selectedRecord?.sourceMeta?.dataWindow || '近 30 天'}</div>
            <div><span class="text-slate-400">采集时间：</span> ${new Date(selectedRecord?.sourceMeta?.collectedAt || selectedRecord?.publishedAt || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      `,
      raw: `
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-2.5">
          <div class="mb-2 text-[10px] uppercase tracking-[0.15em] text-amber-300">原始层</div>
          <div class="space-y-2 text-slate-200">
            <div><span class="text-slate-400">原始摘要：</span> ${raw.originalSummary || '暂无'}</div>
            <div><span class="text-slate-400">联系方式：</span> ${raw.contact?.phone || '未提供'} / ${raw.contact?.email || '未提供'}</div>
            <div><span class="text-slate-400">附件：</span> ${(raw.attachments || []).map((item) => item.label).join(' / ') || '无'}</div>
            <div><span class="text-slate-400">沟通笔记：</span> ${(raw.interviewNotes || []).slice(0, 2).join(' / ') || '暂无'}</div>
          </div>
        </div>
      `,
      timeline: `
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-2.5">
          <div class="mb-2 text-[10px] uppercase tracking-[0.15em] text-emerald-300">时间线层</div>
          <div class="space-y-2">
            ${(timeline || []).slice(-3).map((event) => `
              <div class="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5">
                <div class="font-medium text-slate-100">${event.title}</div>
                <div class="mt-1 text-[10px] text-slate-400">${new Date(event.t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                <div class="mt-1 text-slate-300">${event.desc}</div>
              </div>
            `).join('') || '<div class="text-slate-400">暂无时间线事件</div>'}
          </div>
        </div>
      `,
    };

    panel.innerHTML = tabMap[selectedProfileTab] || tabMap.portrait;
  }

  function renderDetailDrawer() {
    const drawer = document.getElementById('detailDrawer');
    const titleEl = document.getElementById('detailTitle');
    const summaryEl = document.getElementById('detailSummary');
    const distanceEl = document.getElementById('detailDistance');
    const salaryEl = document.getElementById('detailSalary');
    const tagsEl = document.getElementById('detailTags');

    if (!drawer || !titleEl || !summaryEl || !distanceEl || !salaryEl || !tagsEl) return;

    if (!selectedRecord) {
      drawer.style.display = 'none';
      return;
    }

    drawer.style.display = 'block';
    titleEl.textContent = selectedRecord.title || selectedRecord.name;
    summaryEl.innerHTML = selectedRecord.type === 'job'
      ? `${selectedRecord.company} · ${selectedRecord.urgency} · ${selectedRecord.source}<br>联系人：${selectedRecord.recruiter.name}（${selectedRecord.recruiter.phone}）<br>邮箱：${selectedRecord.recruiter.email}`
      : `${selectedRecord.company} · ${selectedRecord.candidateStatus || '待联系'} · ${selectedRecord.contactSummary}<br>电话：${selectedRecord.contact.phone}<br>邮箱：${selectedRecord.contact.email}<br>简历：${selectedRecord.resumeSummary}`;
    distanceEl.textContent = `${selectedRecord.distanceKm}km · ${Number(selectedRecord.yearsOfExperience || 0).toFixed(1)}年经验`;
    salaryEl.textContent = selectedRecord.salary || `${selectedRecord.salaryMin}k-${selectedRecord.salaryMax}k`;
    tagsEl.innerHTML = (selectedRecord.skills || []).map((skill) => `
      <span class="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] text-slate-200">${skill}</span>
    `).join('');

    renderProfilePanel();
  }

  // 更新左侧面板的统计与描述。
  function updateSummaryStats(visibleRecords) {
    const jobCountEl = document.getElementById('jobCount');
    const talentCountEl = document.getElementById('talentCount');
    const mapTitleEl = document.getElementById('mapTitle');
    const distanceNumberEl = document.getElementById('distanceNumber');

    distanceNumberEl.value = String(selectedDistanceKm);

    if (selectedRole === 'jobseeker') {
      mapTitleEl.textContent = '求职者视角 · 岗位地图';
      jobCountEl.textContent = String(visibleRecords.length);
      talentCountEl.textContent = String(mockData.talents.filter((item) => calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, item.lat, item.lng) <= selectedDistanceKm).length);
    } else {
      mapTitleEl.textContent = '招聘方视角 · 人才地图';
      jobCountEl.textContent = String(mockData.jobs.filter((item) => calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, item.lat, item.lng) <= selectedDistanceKm).length);
      talentCountEl.textContent = String(visibleRecords.length);
    }
  }

  // 更改大概地理位置：不要求精确到经纬度，而是按地理区域中心重置地图和 Mock 数据。
  function applyCenterLocation() {
    const inputValue = (document.getElementById('locationText')?.value || '').trim();

    const locationKey = Object.keys(LOCATION_PRESETS).find((key) => {
      const normalizedKey = key.toLowerCase();
      const normalizedInput = inputValue.toLowerCase();
      return normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey);
    });

    const targetLocation = locationKey
      ? LOCATION_PRESETS[locationKey]
      : {
          lat: CENTER_POINT.lat,
          lng: CENTER_POINT.lng,
          name: inputValue || CENTER_POINT.name,
        };

    CENTER_POINT = {
      ...CENTER_POINT,
      ...targetLocation,
      name: targetLocation.name || CENTER_POINT.name,
    };

    mockData.jobs = generateJobs();
    mockData.talents = generateTalents();
    recommendedIds = new Set();
    selectedRecord = null;
    document.getElementById('locationBadge').textContent = CENTER_POINT.name;
    renderGovernanceSummary();
    renderDetailDrawer();

    const mapTitleEl = document.getElementById('mapTitle');
    if (mapTitleEl) {
      mapTitleEl.textContent = selectedRole === 'jobseeker' ? '求职者视角 · 岗位地图' : '招聘方视角 · 人才地图';
    }

    if (map) {
      map.setView([CENTER_POINT.lat, CENTER_POINT.lng], 13);
      renderHeatZones();
    }
    renderMapData();
    fetchAIRecommendation();
  }

  // -------------------------
  // 5. AI / Agent 推荐逻辑（本地规则引擎）
  // -------------------------
  // 真实大模型集成建议：
  // - 把 `fetchAIRecommendation` 改成调用 OpenAI / Qwen / Moonshot 等 API；
  // - 但 Demo 提供“本地模拟 AI”方便本地演示，避免依赖 API Key。
  function hasNegativeSignal(record) {
    if (record.hasNegativeSignal) return true;
    if (record.recentRejectWindowDays && record.recentRejectWindowDays < 180) return true;
    if (record.lastInterviewResult === '未通过' && record.lastInterviewAt && (Date.now() - new Date(record.lastInterviewAt).getTime()) < 180 * 86400000) {
      return true;
    }
    return false;
  }

  function extractYearsFromResume(text = '') {
    const matched = String(text).match(/(\d+(?:\.\d+)?)\s*年/);
    return matched ? Number.parseFloat(matched[1]) : 3;
  }

  function extractExpectedSalaryFromResume(text = '') {
    const matched = String(text).match(/(\d{2,3})\s*k/i);
    return matched ? Number.parseInt(matched[1], 10) : 25;
  }

  function buildRecommendationReasons(record, queryText) {
    const userYears = extractYearsFromResume(queryText);
    const salaryExpect = extractExpectedSalaryFromResume(queryText);
    const salaryLabel = `${record.salaryMin || 0}k-${record.salaryMax || record.salaryMin || 0}k/月`;
    const benefitText = Array.isArray(record.companyBenefits) && record.companyBenefits.length
      ? record.companyBenefits.slice(0, 2).join(' / ')
      : '五险一金 / 弹性工作';
    const experienceGap = Math.abs((Number(record.yearsOfExperience) || 3) - userYears);
    const salaryGap = Math.abs((Number(record.salaryMin) || 0) - salaryExpect);
    const hiringPulse = Number(record.hiringPulseDays ?? 7);

    const reasons = [];
    if (experienceGap <= 2) {
      reasons.push(`经验深度符合，与你约 ${userYears.toFixed(1)} 年经历较匹配`);
    } else {
      reasons.push('经验深度略超出你当前背景，但成长空间清晰');
    }

    if (salaryGap <= 12) {
      reasons.push(`薪资区间 ${salaryLabel} 与预期相符`);
    } else {
      reasons.push(`薪资梯度有竞争力，且 ${salaryLabel} 具备上升空间`);
    }

    reasons.push(`福利待遇覆盖 ${benefitText}`);

    if (hiringPulse <= 7) {
      reasons.push('招聘方近 7 天有招聘动静，岗位更新频繁');
    } else {
      reasons.push('岗位持续在招，说明公司招聘需求稳定');
    }

    if (record.urgency === '急聘') {
      reasons.push('岗位为急聘状态，反馈节奏更快');
    }

    return {
      reasonSummary: reasons.slice(0, 4).join('；'),
      reasons,
    };
  }

  function buildSkillScore(record, queryText) {
    const normalizedQuery = normalizeText(queryText);
    const recordText = normalizeText([record.title, record.company, record.skills.join(' '), record.industry || '', record.salary || ''].join(' '));

    const factors = [];
    let total = 0;

    // 因子 1：技能匹配
    let skillScore = 0;
    for (const keyword of SKILL_LIBRARY) {
      const target = normalizeText(keyword);
      if (target && normalizedQuery.includes(target) && recordText.includes(target)) {
        skillScore += 12;
      }
    }
    if (record.title && normalizedQuery.includes(normalizeText(record.title))) {
      skillScore += 18;
    }
    total += skillScore;
    factors.push({ name: '技能匹配', score: skillScore, weight: 0.2 });

    // 因子 2：经验深度
    const experienceScore = Number(Math.min(18, Math.max(2, (record.salaryMin || 12) / 3)).toFixed(1));
    total += experienceScore;
    factors.push({ name: '经验深度', score: experienceScore, weight: 0.12 });

    // 因子 3：求职意愿 / 状态时效
    let willingnessScore = 0;
    const willingnessText = `${record.jobWillingness || ''} ${record.availability || ''}`.toLowerCase();
    if (willingnessText.includes('立即') || willingnessText.includes('可接洽')) willingnessScore += 14;
    if (willingnessText.includes('考虑') || willingnessText.includes('在职')) willingnessScore += 9;
    if (willingnessText.includes('求职中') || willingnessText.includes('待业')) willingnessScore += 12;
    total += willingnessScore;
    factors.push({ name: '求职意愿', score: willingnessScore, weight: 0.12 });

    // 因子 4：历史反馈信号
    const feedbackScore = (record.replyRate || 0.65) * 100 * 0.2 + (record.interviewFeedback?.length || 1) * 4;
    total += feedbackScore;
    factors.push({ name: '历史反馈', score: feedbackScore, weight: 0.12 });

    // 因子 5：地点偏好 / 通勤接受度
    const commuteScore = Math.max(0, 16 - (record.distanceKm || 0) * 1.8) + (record.commuteTolerance ? 4 : 0);
    total += commuteScore;
    factors.push({ name: '地点偏好', score: commuteScore, weight: 0.12 });

    // 因子 6：距离真值（非只看直线）
    const distanceBenefit = Math.max(0, selectedDistanceKm - record.distanceKm) * 3 + Math.max(0, 12 - record.distanceKm) * 2;
    total += distanceBenefit;
    factors.push({ name: '距离适配', score: distanceBenefit, weight: 0.12 });

    // 因子 7：来源可靠性
    const sourceScore = record.sourceChannels?.length ? Math.min(20, record.sourceChannels.length * 5) : 8;
    total += sourceScore;
    factors.push({ name: '来源可靠性', score: sourceScore, weight: 0.1 });

    // 因子 8：负面信号门控：不直接输出黑箱结果，而是先筛掉明显不适宜推荐的对象。
    let gatePenalty = 0;
    if (hasNegativeSignal(record)) {
      gatePenalty = -999;
    }
    total += gatePenalty;
    factors.push({ name: '负面信号门控', score: gatePenalty, weight: 0.1 });

    // 将可解释的原始得分归一化为 0-100%，供榜单直接展示 MATCH 匹配度。
    const score = clamp(Math.round((total / 170) * 100), 0, 100);
    const reasons = buildRecommendationReasons(record, queryText);
    return { score, factors, ...reasons };
  }

  // 模拟大模型推荐：返回 Top 3 最适合当前用户的点位。
  function generateAIRecommendation() {
    const resumeText = document.getElementById('resumeInput').value || '3年AI产品经理，熟悉大模型、增长分析、用户研究';
    const source = selectedRole === 'jobseeker' ? mockData.jobs : mockData.talents;

    const scored = source
      .filter((record) => {
        const inRange = calculateDistanceKm(CENTER_POINT.lat, CENTER_POINT.lng, record.lat, record.lng) <= selectedDistanceKm;
        return inRange && !hasNegativeSignal(record);
      })
      .map((record) => ({
        ...record,
        ...buildSkillScore(record, resumeText),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    recommendedIds = new Set(scored.map((item) => item.id));

    renderRecommendationList(scored);
    renderMapData();
    return scored;
  }

  // 真实大模型接入示例：
  // if (typeof fetch !== 'undefined') {
  //   const response = await fetch('/api/ai-match', { method:'POST', body: JSON.stringify({ text, role }) });
  //   return await response.json();
  // }
  // 这里默认走本地评分逻辑，适合无后端演示环境。
  async function fetchAIRecommendation() {
    return generateAIRecommendation();
  }

  // 统一构造候选人简历内容：重点展示个人资料、教育背景、工作经历、技能证书和自我评价。
  // 这样点击推荐榜单中的“人物”时，不只是看匹配分数，还能直接查看具备的信息，方便招聘方筛人。
  function buildResumeData(record) {
    const name = record.name || '候选人';
    const title = record.title || 'AI/互联网岗位候选人';
    const skills = Array.isArray(record.skills) ? record.skills : [];
    const educationPool = [
      { school: '北京大学', major: '计算机科学与技术', degree: '本科', time: '2015.09 - 2019.06' },
      { school: '清华大学', major: '人工智能', degree: '硕士', time: '2019.09 - 2022.06' },
      { school: '复旦大学', major: '信息管理与信息系统', degree: '本科', time: '2013.09 - 2017.06' },
      { school: '北京理工大学', major: '软件工程', degree: '本科', time: '2014.09 - 2018.06' },
    ];
    const workPool = [
      { company: 'A公司', role: 'AI产品经理', time: '2022.07 - 2024.09', desc: '负责大模型产品需求分析、用户调研、跨团队协同与落地策略，推动从 0 到 1 的功能上线。' },
      { company: 'B公司', role: '产品运营经理', time: '2020.07 - 2022.06', desc: '负责增长策略设计、数据分析洞察与用户运营，带动关键指标提升。' },
      { company: 'C公司', role: '数据分析师', time: '2018.07 - 2020.06', desc: '搭建数据指标体系和业务分析框架，支撑产品迭代和运营决策。' },
    ];
    const certificatePool = [
      'PMP 项目管理资格',
      'Google Analytics 认证',
      'AWS Solution Architect Associate',
      'AI 产品经理实战认证',
      'Scrum Master 认证',
    ];

    const education = educationPool[(record.id ? Number(String(record.id).split('-').pop()) : 0) % educationPool.length];
    const workExperience = workPool[(record.id ? Number(String(record.id).split('-').pop()) : 0) % workPool.length];
    const certs = certificatePool.slice(0, 3 + ((record.id ? Number(String(record.id).split('-').pop()) : 0) % 2));
    const age = 24 + ((record.id ? Number(String(record.id).split('-').pop()) : 0) % 7);
    const gender = ['女', '男'][((record.id ? Number(String(record.id).split('-').pop()) : 0) % 2)];
    const selfEvaluation = `具备 ${skills.slice(0, 3).join(' / ') || '跨部门协同与业务理解'} 的综合能力，擅长把抽象需求落地为可执行方案，能够在高节奏环境中推动项目迭代和结果提升。对新技术趋势保持敏感，沟通表达清晰，适合参与 ${title} 相关岗位。`;

    return {
      name,
      title,
      gender,
      age,
      phone: record.contact?.phone || '188****1234',
      email: record.contact?.email || 'candidate@example.com',
      city: '北京',
      expectedSalary: record.salary || '期望 20k-35k/月',
      education,
      workExperience,
      skills: skills.length ? skills : ['AI', '产品经理', '增长', '数据分析'],
      certificates: certs,
      selfEvaluation,
    };
  }

  function buildJobDetailData(record) {
    return {
      title: record.title,
      company: record.company,
      salary: record.salary || `${record.salaryMin}k-${record.salaryMax}k/月`,
      benefits: Array.isArray(record.companyBenefits) && record.companyBenefits.length ? record.companyBenefits : ['五险一金', '弹性工作', '年终奖'],
      experience: record.yearsOfExperience ? `${Number(record.yearsOfExperience).toFixed(1)}年` : '1-3年',
      urgency: record.urgency || '正常',
      pulse: record.hiringPulseDays ? `近 ${record.hiringPulseDays} 天有招聘动静` : '岗位持续更新',
      skills: Array.isArray(record.skills) ? record.skills : ['AI', '产品经理', '增长'],
      summary: record.jobSummary || `${record.title}岗位关注业务理解、项目落地和协同推进能力，支持Flexible Work 与高成长路径。`,
    };
  }

  function openResumeModal(record) {
    const modal = document.getElementById('resumeModal');
    const content = document.getElementById('resumeModalContent');
    const title = document.getElementById('resumeModalTitle');
    if (!modal || !content || !title) return;

    if (selectedRole === 'jobseeker') {
      const job = buildJobDetailData(record);
      title.textContent = `${job.company} · ${job.title}`;
      content.innerHTML = `
        <div class="space-y-5 pb-6">
          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">Job Overview</div>
                <h4 class="mt-2 text-2xl font-bold text-white">${job.title}</h4>
              </div>
              <div class="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">${job.urgency}</div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">公司</div>
                <div class="mt-2 text-base font-semibold text-sky-200">${job.company}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">薪资</div>
                <div class="mt-2 text-base font-semibold text-amber-200">${job.salary}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">经验</div>
                <div class="mt-2 text-base font-semibold text-slate-100">${job.experience}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">招聘动向</div>
                <div class="mt-2 text-base font-semibold text-slate-100">${job.pulse}</div>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">岗位概述</div>
            <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm leading-7 text-slate-200">${job.summary}</div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">福利待遇</div>
            <div class="flex flex-wrap gap-2">
              ${job.benefits.map((benefit) => `<span class="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">${benefit}</span>`).join('')}
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">岗位要求</div>
            <div class="flex flex-wrap gap-2">
              ${job.skills.map((skill) => `<span class="rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-100">${skill}</span>`).join('')}
            </div>
          </section>
        </div>
      `;
    } else {
      const resume = buildResumeData(record);
      title.textContent = `${resume.name} · ${resume.title}`;
      content.innerHTML = `
        <div class="space-y-5 pb-6">
          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">Personal Information</div>
                <h4 class="mt-2 text-2xl font-bold text-white">${resume.name}</h4>
              </div>
              <div class="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">${resume.city} · ${resume.age}岁</div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">岗位方向</div>
                <div class="mt-2 text-base font-semibold text-sky-200">${resume.title}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">薪资期望</div>
                <div class="mt-2 text-base font-semibold text-amber-200">${resume.expectedSalary}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">手机号</div>
                <div class="mt-2 text-base font-semibold text-slate-100">${resume.phone}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">邮箱</div>
                <div class="mt-2 text-base font-semibold text-slate-100">${resume.email}</div>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Education</div>
            <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-lg font-semibold text-white">${resume.education.school}</div>
                  <div class="mt-1 text-sm text-slate-300">${resume.education.major} · ${resume.education.degree}</div>
                </div>
                <div class="text-xs text-slate-400">${resume.education.time}</div>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Work Experience</div>
            <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-lg font-semibold text-white">${resume.workExperience.company}</div>
                  <div class="mt-1 text-sm text-sky-200">${resume.workExperience.role}</div>
                </div>
                <div class="text-xs text-slate-400">${resume.workExperience.time}</div>
              </div>
              <div class="mt-3 text-sm leading-6 text-slate-300">${resume.workExperience.desc}</div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Skills & Certificates</div>
            <div class="mb-4 flex flex-wrap gap-2">
              ${resume.skills.map((skill) => `<span class="rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-100">${skill}</span>`).join('')}
            </div>
            <div class="flex flex-wrap gap-2">
              ${resume.certificates.map((cert) => `<span class="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">${cert}</span>`).join('')}
            </div>
          </section>

          <section class="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Self Evaluation</div>
            <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm leading-7 text-slate-200">${resume.selfEvaluation}</div>
          </section>
        </div>
      `;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeResumeModal() {
    const modal = document.getElementById('resumeModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function renderRecruitingPulse() {
    const panel = document.getElementById('recruitingPulsePanel');
    const title = document.getElementById('recruitingPulseTitle');
    if (!panel) return;

    const pulseList = [...mockData.jobs]
      .sort((a, b) => (a.hiringPulseDays || 99) - (b.hiringPulseDays || 99))
      .slice(0, 4)
      .map((job) => {
        const urgency = job.urgency === '急聘' ? '急聘' : '正在招聘';
        const benefitText = Array.isArray(job.companyBenefits) ? job.companyBenefits.slice(0, 2).join(' / ') : '五险一金';
        return `
          <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold text-white">${job.company}</div>
              <span class="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-100">${urgency}</span>
            </div>
            <div class="mt-1 text-[11px] text-slate-300">${job.title} · ${job.salary}</div>
            <div class="mt-2 text-[10px] text-slate-400">福利：${benefitText} · 近 ${job.hiringPulseDays || 7} 天有招聘动静</div>
          </div>
        `;
      })
      .join('');

    if (title) {
      title.textContent = selectedRole === 'jobseeker' ? '招聘方动向' : '招聘动向';
    }

    panel.innerHTML = pulseList || '<div class="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-400">暂无最近招聘动向</div>';
  }

  // 更新右侧顶部“AI 推荐榜单”列表：
  // 这里不仅展示最终分数，还展示各因子明细，避免黑箱推荐。
  function renderRecommendationList(sortedRecords) {
    const listEl = document.getElementById('recommendationList');
    listEl.innerHTML = '';

    if (!sortedRecords || sortedRecords.length === 0) {
      listEl.innerHTML = '<li class="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-400">暂无推荐结果</li>';
      renderRecruitingPulse();
      return;
    }

    sortedRecords.forEach((record, index) => {
      const reasonText = record.reasonSummary || (record.factors || [])
        .slice(0, 3)
        .map((factor) => `${factor.name}:${factor.score}`)
        .join(' · ');

      const item = document.createElement('li');
      item.className = 'cursor-pointer rounded-2xl border border-amber-400/25 bg-amber-500/5 px-3 py-2 transition hover:border-amber-300/50 hover:bg-amber-500/10';
      item.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-sm font-semibold text-white">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-950">${index + 1}</span>
              ${record.title || record.name}
            </div>
            <div class="mt-1 text-[11px] text-slate-400">${record.company || record.source} · ${record.distanceKm}km</div>
          </div>
          <div class="text-right">
            <div class="text-[11px] uppercase tracking-[0.16em] text-amber-200">MATCH</div>
            <div class="text-lg font-bold text-amber-300">${record.score}%</div>
          </div>
        </div>
        <div class="mt-2 text-[10px] text-amber-100/80">为什么推荐：${reasonText}</div>
      `;
      item.addEventListener('click', () => openResumeModal(record));
      listEl.appendChild(item);
    });

    renderRecruitingPulse();
  }

  // -------------------------
  // 6. 事件绑定：身份切换 / 距离滑块 / AI 按钮
  // -------------------------
  function bindEvents() {
    const roleButtons = document.querySelectorAll('.role-toggle');
    roleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        selectedRole = button.dataset.role;

        // 视觉状态切换：高亮当前主动角色。
        roleButtons.forEach((btn) => {
          const isActive = btn === button;
          btn.classList.toggle('bg-sky-500/20', isActive && selectedRole === 'jobseeker');
          btn.classList.toggle('border-sky-400/40', isActive && selectedRole === 'jobseeker');
          btn.classList.toggle('text-sky-100', isActive && selectedRole === 'jobseeker');

          btn.classList.toggle('bg-slate-800/70', !isActive || selectedRole !== 'jobseeker');
          btn.classList.toggle('border-slate-700', !isActive || selectedRole !== 'jobseeker');
          btn.classList.toggle('text-slate-300', !isActive || selectedRole !== 'jobseeker');
        });

        if (selectedRole === 'jobseeker') {
          document.getElementById('jobSeekerBtn').className = 'role-toggle rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-2.5 text-sm font-semibold text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.15)] transition hover:bg-sky-500/25';
          document.getElementById('employerBtn').className = 'role-toggle rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white';
        } else {
          document.getElementById('employerBtn').className = 'role-toggle rounded-xl border border-orange-400/40 bg-orange-500/20 px-3 py-2.5 text-sm font-semibold text-orange-100 shadow-[0_0_0_1px_rgba(245,158,11,0.15)] transition hover:bg-orange-500/25';
          document.getElementById('jobSeekerBtn').className = 'role-toggle rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white';
        }

        renderHeatZones();
        renderRecruitingPulse();
        renderMapData();
      });
    });

    document.getElementById('closeDrawerBtn').addEventListener('click', () => {
      selectedRecord = null;
      renderDetailDrawer();
    });

    const resumeModal = document.getElementById('resumeModal');
    if (resumeModal) {
      resumeModal.addEventListener('click', (event) => {
        if (event.target === resumeModal) {
          closeResumeModal();
        }
      });
    }

    const closeResumeModalBtn = document.getElementById('closeResumeModalBtn');
    if (closeResumeModalBtn) {
      closeResumeModalBtn.addEventListener('click', closeResumeModal);
    }

    document.querySelectorAll('.profile-tab').forEach((button) => {
      button.addEventListener('click', () => {
        selectedProfileTab = button.dataset.profileTab;
        document.querySelectorAll('.profile-tab').forEach((item) => {
          const isActive = item === button;
          item.classList.toggle('border-sky-400/40', isActive);
          item.classList.toggle('bg-sky-500/10', isActive);
          item.classList.toggle('text-sky-100', isActive);
          item.classList.toggle('border-slate-700', !isActive);
          item.classList.toggle('bg-slate-800', !isActive);
          item.classList.toggle('text-slate-300', !isActive);
        });
        renderProfilePanel();
      });
    });

    document.getElementById('draftOutreachBtn').addEventListener('click', () => {
      if (!selectedRecord) return;
      ensureProfile(selectedRecord);
      const profile = selectedRecord.profile;
      const job = mockData.jobs[0] || selectedRecord;
      if (window.OutreachAssistant) {
        const draft = window.OutreachAssistant.generateOutreachDraft(profile, job);
        selectedRecord.outreachDraft = draft.draft;
        alert(`已生成建联草稿：\n\n${draft.draft.slice(0, 220)}${draft.draft.length > 220 ? '...' : ''}`);
      } else {
        alert(`已生成 ${selectedRecord.name || selectedRecord.title} 的建联草稿，等待猎头确认后再发送。`);
      }
    });

    document.getElementById('followUpBtn').addEventListener('click', () => {
      if (!selectedRecord) return;
      const name = selectedRecord.name || selectedRecord.title || '该对象';
      alert(`${name} 已加入待办提醒：7 天无回复自动提醒猎头跟进，不直接改状态。`);
    });

    document.getElementById('publishRoleBtn').addEventListener('click', () => {
      const newRole = selectedRole === 'jobseeker' ? 'AI 产品经理' : '大模型运营';
      alert(`已发布岗位：${newRole}，将同步到附近 ${selectedDistanceKm} 公里范围内的候选人/求职者看板。`);
    });

    const radiusInput = document.getElementById('distanceRange');
    const distanceNumberInput = document.getElementById('distanceNumber');

    // 统一处理距离输入，确保滑块和数字输入框始终保持同步。
    const syncDistanceFilter = (value) => {
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue)) return;

      selectedDistanceKm = clamp(parsedValue, 0.1, 5);
      selectedDistanceKm = Number(selectedDistanceKm.toFixed(1));
      radiusInput.value = String(selectedDistanceKm);
      distanceNumberInput.value = String(selectedDistanceKm);
      renderHeatZones();
      renderMapData();
    };

    radiusInput.addEventListener('input', (event) => {
      syncDistanceFilter(event.target.value);
    });

    distanceNumberInput.addEventListener('input', (event) => {
      if (event.target.value === '') return;
      syncDistanceFilter(event.target.value);
    });

    distanceNumberInput.addEventListener('change', (event) => {
      syncDistanceFilter(event.target.value || selectedDistanceKm);
    });

    const salaryMinEl = document.getElementById('salaryMin');
    const salaryMaxEl = document.getElementById('salaryMax');

    const syncSalaryFilter = () => {
      const minValue = Number(salaryMinEl.value);
      const maxValue = Number(salaryMaxEl.value);
      salaryFilter.min = Math.min(minValue, maxValue);
      salaryFilter.max = Math.max(minValue, maxValue);
      renderMapData();
    };

    salaryMinEl.addEventListener('change', syncSalaryFilter);
    salaryMaxEl.addEventListener('change', syncSalaryFilter);

    // 这里我们对 “求职意愿” 建立一个隐含筛选策略：
    // "可立即入职" 往往更适合急聘岗位，而 "在职考虑" 更适合高频势头的岗位流转。
    const intentOptions = {
      all: 'all',
      immediate: 'immediate',
      considering: 'considering',
      open: 'open',
    };
    availabilityFilter = intentOptions.immediate;

    document.querySelectorAll('.status-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        selectedStatus = button.dataset.status || 'all';
        document.querySelectorAll('.status-toggle').forEach((item) => {
          const isActive = item === button;
          item.classList.toggle('border-sky-400/40', isActive);
          item.classList.toggle('bg-sky-500/10', isActive);
          item.classList.toggle('text-sky-100', isActive);
          item.classList.toggle('border-slate-700', !isActive);
          item.classList.toggle('bg-slate-900/60', !isActive);
          item.classList.toggle('text-slate-300', !isActive);
        });
        renderMapData();
      });
    });

    document.getElementById('matchBtn').addEventListener('click', () => {
      fetchAIRecommendation();
    });

    const locationInput = document.getElementById('locationText');
    let locationDebounceTimer = null;

    const syncLocationChips = (selectedValue) => {
      document.querySelectorAll('.location-chip').forEach((chip) => {
        const isActive = chip.dataset.location === selectedValue;
        chip.classList.toggle('border-sky-400/30', isActive);
        chip.classList.toggle('bg-sky-500/10', isActive);
        chip.classList.toggle('text-sky-100', isActive);
        chip.classList.toggle('border-slate-700', !isActive);
        chip.classList.toggle('bg-slate-800/70', !isActive);
        chip.classList.toggle('text-slate-200', !isActive);
      });
    };

    document.querySelectorAll('.location-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const selected = chip.dataset.location;
        locationInput.value = selected;
        syncLocationChips(selected);
        applyCenterLocation();
      });
    });

    locationInput.addEventListener('input', () => {
      clearTimeout(locationDebounceTimer);
      locationDebounceTimer = setTimeout(() => {
        const currentValue = locationInput.value.trim();
        syncLocationChips(currentValue);
        applyCenterLocation();
      }, 300);
    });

    locationInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        clearTimeout(locationDebounceTimer);
        syncLocationChips(locationInput.value.trim());
        applyCenterLocation();
      }
    });

    document.getElementById('applyLocationBtn').addEventListener('click', () => {
      syncLocationChips(locationInput.value.trim());
      applyCenterLocation();
    });
  }

  // -------------------------
  // 7. 运行入口
  // -------------------------
  function bootstrap() {
    initializeData();
    initMap();
    bindEvents();

    // 页面首次默认执行 AI 推荐，确保地图上有金色高亮点。
    setTimeout(() => {
      fetchAIRecommendation();
    }, 120);
  }

  // 确保脚本在页面加载后执行，并在本地静态服务器可直接打开。
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
