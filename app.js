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
  let employerJobPosts = [];
  let selectedEmployerJob = null;
  let companyCenter = {
    lat: 39.914,
    lng: 116.455,
    name: '北京国贸',
  };
  let searchCenter = { ...companyCenter };

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
  let recommendationPulseLayer;
  let allMarkers = [];
  let selectedRecord = null;
  let selectedProfileTab = 'portrait';

  const LOCATION_PRESETS = {
    '北京国贸': {
      lat: 39.914,
      lng: 116.455,
      name: '北京国贸',
      districts: [
        { name: '国贸CBD', type: 'business', latOffset: 0.008, lngOffset: 0.01 },
        { name: '三里屯', type: 'business', latOffset: 0.016, lngOffset: -0.008 },
        { name: '朝外SOHO', type: 'business', latOffset: -0.006, lngOffset: 0.015 },
        { name: '亮马桥', type: 'business', latOffset: -0.013, lngOffset: -0.014 },
        { name: '地铁国贸站', type: 'subway', latOffset: 0.004, lngOffset: 0.001 },
        { name: '朝阳科技园', type: 'industrial', latOffset: 0.02, lngOffset: 0.019 },
      ],
    },
    '北京CBD': {
      lat: 39.914,
      lng: 116.455,
      name: '北京CBD',
      districts: [
        { name: 'CBD核心', type: 'business', latOffset: 0.004, lngOffset: 0.006 },
        { name: '建国门', type: 'subway', latOffset: 0.013, lngOffset: -0.015 },
        { name: '北京站', type: 'subway', latOffset: -0.015, lngOffset: -0.012 },
        { name: '金融街', type: 'business', latOffset: -0.02, lngOffset: 0.018 },
        { name: '国贸商圈', type: 'business', latOffset: 0.009, lngOffset: 0.012 },
        { name: '朝阳产业园', type: 'industrial', latOffset: 0.026, lngOffset: 0.024 },
      ],
    },
    '上海陆家嘴': {
      lat: 31.239,
      lng: 121.499,
      name: '上海陆家嘴',
      districts: [
        { name: '陆家嘴金融区', type: 'business', latOffset: 0.006, lngOffset: 0.011 },
        { name: '浦东CBD', type: 'business', latOffset: -0.002, lngOffset: 0.019 },
        { name: '东方明珠', type: 'business', latOffset: 0.013, lngOffset: -0.006 },
        { name: '世纪大道', type: 'subway', latOffset: -0.011, lngOffset: 0.008 },
        { name: '张江', type: 'industrial', latOffset: 0.023, lngOffset: -0.021 },
        { name: '陆家嘴地铁站', type: 'subway', latOffset: 0.008, lngOffset: 0.014 },
      ],
    },
    '上海静安': {
      lat: 31.229,
      lng: 121.457,
      name: '上海静安',
      districts: [
        { name: '静安寺', type: 'business', latOffset: 0.01, lngOffset: 0.007 },
        { name: '南京西路', type: 'business', latOffset: -0.004, lngOffset: -0.009 },
        { name: '上海中心', type: 'business', latOffset: 0.016, lngOffset: 0.014 },
        { name: '西藏北路', type: 'subway', latOffset: -0.019, lngOffset: 0.006 },
        { name: '商务圈', type: 'business', latOffset: 0.005, lngOffset: 0.017 },
        { name: '静安产业园', type: 'industrial', latOffset: -0.022, lngOffset: 0.02 },
      ],
    },
    '深圳湾区': {
      lat: 22.536,
      lng: 113.949,
      name: '深圳湾区',
      districts: [
        { name: '湾区科技', type: 'industrial', latOffset: 0.006, lngOffset: 0.009 },
        { name: '海岸城', type: 'business', latOffset: -0.009, lngOffset: -0.011 },
        { name: '腾讯湾区', type: 'business', latOffset: 0.013, lngOffset: -0.003 },
        { name: '深圳湾', type: 'business', latOffset: -0.018, lngOffset: 0.014 },
        { name: '湾区地铁', type: 'subway', latOffset: 0.002, lngOffset: 0.019 },
        { name: '前海创新园', type: 'industrial', latOffset: 0.024, lngOffset: -0.02 },
      ],
    },
    '深圳福田': {
      lat: 22.543,
      lng: 114.057,
      name: '深圳福田',
      districts: [
        { name: '福田中心', type: 'business', latOffset: 0.005, lngOffset: 0.007 },
        { name: '深南大道', type: 'subway', latOffset: -0.012, lngOffset: 0.01 },
        { name: '购物中心', type: 'business', latOffset: 0.019, lngOffset: -0.009 },
        { name: '桂圆路', type: 'subway', latOffset: -0.024, lngOffset: 0.02 },
        { name: '科技园', type: 'industrial', latOffset: 0.012, lngOffset: -0.02 },
        { name: '福田产业园', type: 'industrial', latOffset: -0.028, lngOffset: 0.026 },
      ],
    },
    '广州珠江新城': {
      lat: 23.123,
      lng: 113.323,
      name: '广州珠江新城',
      districts: [
        { name: '珠江新城', type: 'business', latOffset: 0.008, lngOffset: 0.009 },
        { name: '花城湾', type: 'business', latOffset: -0.01, lngOffset: 0.012 },
        { name: '天河北', type: 'subway', latOffset: 0.017, lngOffset: -0.013 },
        { name: '金融中心', type: 'business', latOffset: -0.015, lngOffset: 0.02 },
        { name: '广州塔', type: 'business', latOffset: 0.011, lngOffset: -0.021 },
        { name: '广州开发区', type: 'industrial', latOffset: -0.029, lngOffset: 0.03 },
      ],
    },
    '成都天府': {
      lat: 30.572,
      lng: 104.066,
      name: '成都天府',
      districts: [
        { name: '天府CBD', type: 'business', latOffset: 0.009, lngOffset: 0.011 },
        { name: '金融城', type: 'business', latOffset: -0.012, lngOffset: -0.009 },
        { name: '天府广场', type: 'subway', latOffset: 0.018, lngOffset: 0.009 },
        { name: '科技园', type: 'industrial', latOffset: -0.021, lngOffset: 0.023 },
        { name: '地铁天府站', type: 'subway', latOffset: 0.006, lngOffset: -0.018 },
        { name: '创新产业园', type: 'industrial', latOffset: -0.032, lngOffset: -0.028 },
      ],
    },
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
      const experienceLevels = ['1-3年', '3-5年', '5年以上', '2年以上'];
      const educationLevels = ['大专', '本科', '硕士', '本科优先', '硕士优先'];
      const workEnvironments = ['总部办公 / 周三至周五驻场', '混合办公 / 允许远程 2 天', '在岗现场协作 / 需要出差', '灵活办公 / 近地铁'];
      const jobContentTemplates = [
        '负责产品需求梳理、用户研究、方案评审与落地推进，推动 AI 产品的迭代和增长闭环。',
        '负责业务方向拆解、跨团队协同沟通、数据指标分析与关键问题推动，提升产品成熟度与用户体验。',
        '负责功能方案设计、需求拆解、项目执行与上线跟踪，确保高质量交付与数据优化。',
        '围绕用户增长与业务指标，开展运营策略优化、渠道协同与活动落地，持续提升转化效果。',
      ];
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
        requiredExperience: experienceLevels[index % experienceLevels.length],
        education: educationLevels[index % educationLevels.length],
        workEnvironment: workEnvironments[index % workEnvironments.length],
        technicalSkills: skillGroup,
        jobContent: jobContentTemplates[index % jobContentTemplates.length],
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

    // 招聘方视角不再展示 50 条杂乱的候选人点，改为 5 条经过筛选后的“候选人短名单”；
    // 这样更像真实招聘工作台：重点看高价值候选人 + 明确的重复风险提示，
    // 而不是把大量相似简历堆在地图上造成视觉噪音。
    const talentCenter = selectedRole === 'employer' ? searchCenter : CENTER_POINT;

    return Array.from({ length: 5 }, (_, index) => {
      const point = randomPointNearCenter(talentCenter.lat, talentCenter.lng, 5);
      const title = titles[index % titles.length];
      const skillGroup = skillSets[index % skillSets.length];
      const salaryMin = 10 + (index % 8) * 4;
      const salaryMax = salaryMin + 8 + (index % 4) * 3;
      const distanceKm = calculateDistanceKm(talentCenter.lat, talentCenter.lng, point.lat, point.lng);
      const status = statuses[index % statuses.length];
      const channel = channels[index % channels.length];
      const replyRate = 0.45 + (index % 6) * 0.08;
      const commuteTolerance = 15 + (index % 4) * 5;
      const hasNegativeSignal = index % 6 === 0;
      const recentRejectWindowDays = hasNegativeSignal ? 30 + (index % 5) * 12 : null;
      const lastInterviewAt = index % 5 === 0 ? new Date(Date.now() - 60 * 86400000).toISOString() : null;
      const lastInterviewResult = index % 5 === 0 ? '未通过' : '待定';
      const duplicateSignals = [
        index % 2 === 0 ? '简历重复：工作经历与投递材料高度重叠' : '简历重复：教育背景与项目经历高度相似',
        index % 3 === 0 ? '经历交叉：近 2 年的职责与项目内容重合' : '经历交叉：技术栈及业务背景存在交叉',
      ];

      const phone = `186${String(10000000 + index * 173).slice(0, 8)}`;
      const email = `${names[index % names.length].slice(0, 2).toLowerCase()}${index + 1}@mail.com`;
      const resumeSummary = `${title}候选人，拥有 ${Math.min(8, 2 + (index % 6))} 年相关经验，熟悉 ${skillGroup.slice(0, 2).join(' / ')}，具备从 0 到 1 产品与运营协同能力，擅长跨团队沟通与落地。${duplicateSignals.join('；')}`;
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
        dedupKey: `${names[index % names.length]}-${title}-${channel}-duplicate-${index + 1}`,
        duplicateSignals,
        dedupeReason: duplicateSignals[0],
        lastContact: new Date(Date.now() - index * 86400000).toISOString(),
        contactSummary: index % 2 === 0 ? '沟通符合岗位预期，建议继续推进初筛；但存在简历重复与经历交叉风险' : '已安排技术面试，待反馈；需重点核验候选人归并情况',
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
    const duplicateCandidates = mockData.talents.filter((item) => Array.isArray(item.duplicateSignals) && item.duplicateSignals.length > 0).length || 5;
    const suspectedCount = allRecords.filter((item) => {
      const hasDuplicateSignals = Array.isArray(item.duplicateSignals) && item.duplicateSignals.length > 0;
      const hasLowCoverage = !Array.isArray(item.skills) || item.skills.length === 0 || !(item.salaryMin || item.salaryMax || item.salary) || !item.sourceMeta?.collectedAt;
      return hasDuplicateSignals || hasLowCoverage;
    }).length;

    return {
      totalRecords: allRecords.length,
      sourceTypeCount: sourceTypes.size,
      staleCount,
      multiSourceCount,
      suspectedCount,
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

  function renderGovernanceDrawerBody() {
    const drawerBody = document.getElementById('governanceDrawerBody');
    if (!drawerBody) return;

    const summary = buildGovernanceSummary();
    const rows = buildGovernanceDetails();
    const schema = buildSchemaMatrix();
    const insights = buildGovernanceInsights();
    const avgCoverage = Math.round(
      rows.reduce((acc, row) => acc + Number.parseInt(row.fieldCoverage, 10), 0) / Math.max(rows.length, 1)
    );

    const metricCards = [
      { key: '总记录', value: summary.totalRecords },
      { key: '数据治理健康度', value: `${avgCoverage}%` },
    ];

    const sourceTable = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">来源口径</div>
          <span class="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-200">点击总览</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-[11px] text-slate-200">
            <thead class="bg-slate-950/70 text-slate-400">
              <tr>
                <th class="px-3 py-2 font-medium">来源</th>
                <th class="px-3 py-2 font-medium">记录数</th>
                <th class="px-3 py-2 font-medium">关键字段覆盖</th>
                <th class="px-3 py-2 font-medium">治理建议状态</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const issueFirst = insights.find((item) => item.sourceType === row.sourceType)?.issues?.[0] || '口径稳定，近期无明显治理风险';
                return `
                  <tr class="border-t border-slate-700/80">
                    <td class="px-3 py-2 text-slate-100">${row.sourceType}</td>
                    <td class="px-3 py-2">${row.count}</td>
                    <td class="px-3 py-2 text-sky-300">${row.fieldCoverage}</td>
                    <td class="px-3 py-2 ${row.attention === '需补齐/更新' ? 'text-amber-300' : 'text-emerald-300'}">${issueFirst}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const matrixTable = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
        <div class="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">字段分布</div>
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
      </div>
    `;

    const insightPanel = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
        <div class="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">治理建议汇总</div>
        <div class="space-y-2">
          ${insights.map((item) => `
            <div class="rounded-xl border border-slate-700 bg-slate-950/70 p-2">
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="font-medium text-slate-100">${item.sourceType}</span>
                <span class="rounded-full border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-200">已合并</span>
              </div>
              <ul class="list-disc space-y-1 pl-4 text-[11px] text-slate-300">
                ${item.issues.map((issue) => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    drawerBody.innerHTML = `
      <div class="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">数据治理健康度</div>
            <div class="mt-1 text-lg font-bold text-white"><span class="${avgCoverage >= 80 ? 'text-emerald-200' : avgCoverage >= 60 ? 'text-amber-200' : 'text-rose-200'}">${avgCoverage >= 80 ? '健康' : avgCoverage >= 60 ? '待改善' : '需治理'}</span></div>
          </div>
          <div class="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-sm font-semibold text-slate-100">${avgCoverage}%</div>
        </div>
        <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" style="width: ${avgCoverage}%"></div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
        ${metricCards.map((card) => `
          <button type="button" class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-left transition hover:border-sky-400 hover:bg-slate-800/80">
            <div class="text-[10px] uppercase tracking-[0.15em] text-slate-400">${card.key}</div>
            <div class="mt-2 text-xl font-bold text-white">${card.value}</div>
          </button>
        `).join('')}
      </div>

      ${sourceTable}
      ${matrixTable}
      ${insightPanel}
    `;
  }

  function openGovernanceDrawer() {
    const drawer = document.getElementById('governanceDrawer');
    if (!drawer) return;
    renderGovernanceDrawerBody();
    drawer.classList.remove('hidden');
  }

  function closeGovernanceDrawer() {
    const drawer = document.getElementById('governanceDrawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
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
          <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">数据治理健康度</div>
          <div class="mt-1 text-lg font-bold text-white"><span class="${healthColor}">${healthState}</span></div>
        </div>
        <div class="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-sm font-semibold text-slate-100">${avgCoverage}%</div>
      </div>
      <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" style="width: ${avgCoverage}%"></div>
      </div>
    `;

    const cards = [
      { label: '总记录', value: summary.totalRecords, key: 'total' },
    ];

    summaryContainer.innerHTML = cards.map((card) => `
      <button type="button" data-governance-key="${card.key}" class="governance-card w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-left transition hover:border-sky-400 hover:bg-slate-800/80">
        <div class="text-[10px] uppercase tracking-[0.15em] text-slate-400">${card.label}</div>
        <div class="mt-2 text-xl font-bold text-white">${card.value}</div>
      </button>
    `).join('');

    summaryContainer.querySelectorAll('.governance-card').forEach((button) => {
      button.addEventListener('click', () => openGovernanceDrawer());
    });

    tableContainer.innerHTML = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
        点击总记录卡片即可展开合并后的数据治理总览。
      </div>
    `;

    schemaMatrixContainer.innerHTML = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
        详细字段覆盖与治理建议仍保留在点击展开的总览中，页面不再重复展示额外筛选项。
      </div>
    `;

    insightsContainer.innerHTML = `
      <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
        仅保留总记录与数据治理健康度两个核心维度，避免噪音项干扰。
      </div>
    `;
  }

  // 统一入口：创建 Mock 数据，避免在前端直接硬编码过多信息。
  function initializeData() {
    mockData.jobs = generateJobs();
    mockData.talents = generateTalents();
    employerJobPosts = buildGameCompanyJobPosts();
    selectedEmployerJob = employerJobPosts[0] || null;
    renderGovernanceSummary();
    renderEmployerJobEditor();
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

    // 高德/导航地图的感觉，核心不是品牌本身，而是：
    // 1）清晰的道路与街道层级；
    // 2）更强的城市导航视觉；
    // 3）适合北京 / 上海 / 深圳 / 广州等城市地图切换。
    // 这里使用 Carto 的街道风格底图，能更像城市导航地图，同时无需密钥。
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
      detectRetina: true,
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    radarCircleLayer = L.layerGroup().addTo(map);
    recommendationPulseLayer = L.layerGroup().addTo(map);

    renderHeatZones();
    renderMapData();
  }

  // 展示“覆盖半径”区域：模拟热力图/雷达扫描感，便于产品理解“地图围栏”的概念。
  function renderHeatZones() {
    radarCircleLayer.clearLayers();

    const color = selectedRole === 'jobseeker' ? '#38bdf8' : '#f59e0b';
    const circleRadius = selectedDistanceKm * 1000;
    const radarCenter = selectedRole === 'employer' ? companyCenter : CENTER_POINT;

    const glowCircle = L.circle([radarCenter.lat, radarCenter.lng], {
      radius: circleRadius,
      color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 1.5,
      opacity: 0.8,
    }).addTo(radarCircleLayer);

    const outerRing = L.circle([radarCenter.lat, radarCenter.lng], {
      radius: Math.min(circleRadius + 900, 5000),
      color: '#94a3b8',
      fill: false,
      weight: 1,
      dashArray: '6 8',
      opacity: 0.45,
    }).addTo(radarCircleLayer);

    // 真正的地图展示逻辑应以真实地理中心和街区粒度为主，
    // 而不是把视野强行锁定在“随机圆圈半径”的 bounds 上。
    // 这样就能看到真实的道路、商业区和街道网络，而不是只看一个抽象红蓝圈。
    if (map && map.getZoom() < 13) {
      map.setView([radarCenter.lat, radarCenter.lng], 14, { animate: false });
    }
    map && map.invalidateSize();
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
      const requirementSkills = Array.isArray(record.technicalSkills) && record.technicalSkills.length ? record.technicalSkills : record.skills;
      const workExperience = record.requiredExperience || `${Number(record.yearsOfExperience || 3).toFixed(1)}年`;
      const education = record.education || '本科优先';
      const workEnvironment = record.workEnvironment || '混合办公 / 允许远程 2 天';
      const workContent = record.jobContent || record.jobSummary || '负责相关业务梳理与协同推进，推动目标落地。';

      return `
        <div style="width:260px; padding: 10px 12px 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="background: rgba(56,189,248,0.12); color:#7dd3fc; border:1px solid rgba(56,189,248,0.25); border-radius:999px; padding:4px 8px; font-size:11px; font-weight:700;">急聘岗位</span>
            <span style="font-size:11px; color:#cbd5e1;">${record.distanceKm}km</span>
          </div>
          <div style="font-size:16px; font-weight:700; color:#f8fafc; margin-bottom:6px;">${record.title}</div>
          <div style="color:#cbd5e1; font-size:12px; margin-bottom:4px;">${record.company}</div>
          <div style="color:#fbbf24; font-weight:700; font-size:15px; margin-bottom:8px;">${record.salary}</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            ${requirementSkills.map((skill) => `<span style="background: rgba(148,163,184,0.12); color:#e2e8f0; border:1px solid rgba(148,163,184,0.18); border-radius:999px; padding:3px 7px; font-size:10px;">${skill}</span>`).join('')}
          </div>
          <div style="font-size:11px; line-height:1.6; color:#cbd5e1;">
            <div><strong style="color:#f8fafc;">工作年限：</strong>${workExperience}</div>
            <div><strong style="color:#f8fafc;">学历背景：</strong>${education}</div>
            <div><strong style="color:#f8fafc;">技术能力：</strong>${requirementSkills.slice(0, 3).join(' / ')}</div>
            <div><strong style="color:#f8fafc;">工作环境：</strong>${workEnvironment}</div>
            <div><strong style="color:#f8fafc;">工作内容：</strong>${workContent}</div>
            <div>岗位来源：${record.source}</div>
            <div>数据口径：${record.sourceMeta?.schemaVersion || 'v1.2'} / ${record.sourceMeta?.dataWindow || '近 30 天'}</div>
            <div>采集时间：${new Date(record.sourceMeta?.collectedAt || record.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div>联系人：${record.recruiter.name} / ${record.recruiter.phone}</div>
            <div>邮箱：${record.recruiter.email}</div>
            <div>岗位简介：${record.jobSummary}</div>
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
        <div>疑似重复：${(record.duplicateSignals || ['无']).slice(0, 2).join(' / ')}</div>
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
        recordId: record.id,
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
  // 注意：这里不再把地图强行缩放到半径圈，而是按照真实地理视野来展示周边的街道和商业区。
  function refreshMapContext() {
    if (!map) return;
    const focusPoint = selectedRole === 'employer' ? companyCenter : CENTER_POINT;
    const zoomLevel = 14;
    map.setView([focusPoint.lat, focusPoint.lng], zoomLevel, {
      animate: true,
      duration: 0.45,
    });
    map.invalidateSize();
    renderHeatZones();
  }

  function syncLocationModeUI() {
    const locationLabel = document.getElementById('locationLabel');
    const locationInput = document.getElementById('locationText');
    if (locationLabel) {
      locationLabel.textContent = selectedRole === 'employer' ? '搜索周边人才位置' : '更改地理位置';
    }
    if (locationInput) {
      locationInput.placeholder = selectedRole === 'employer'
        ? '例如：深圳湾区 / 上海陆家嘴 / 北京国贸（按公司定位搜索周边人才）'
        : '例如：北京国贸 / 上海陆家嘴 / 深圳湾区';
    }

    const locationBadge = document.getElementById('locationBadge');
    if (locationBadge) {
      const displayName = selectedRole === 'employer' ? `${companyCenter.name} · 公司定位` : CENTER_POINT.name;
      locationBadge.textContent = displayName;
    }
  }

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
          lat: selectedRole === 'employer' ? searchCenter.lat : CENTER_POINT.lat,
          lng: selectedRole === 'employer' ? searchCenter.lng : CENTER_POINT.lng,
          name: inputValue || (selectedRole === 'employer' ? searchCenter.name : CENTER_POINT.name),
        };

    if (selectedRole === 'employer') {
      // 招聘方模式下，地图仍以公司定位为锚点，不把“搜索位置”覆盖掉公司中心；
      // 但人才生成与推荐匹配都应以搜索位置为基准，确保“公司在地图上固定、人才在周边检索”。
      searchCenter = {
        ...searchCenter,
        ...targetLocation,
        name: targetLocation.name || searchCenter.name,
      };
    } else {
      CENTER_POINT = {
        ...CENTER_POINT,
        ...targetLocation,
        name: targetLocation.name || CENTER_POINT.name,
      };
      searchCenter = { ...CENTER_POINT };
    }

    mockData.jobs = generateJobs();
    mockData.talents = generateTalents();
    recommendedIds = new Set();
    selectedRecord = null;
    syncLocationModeUI();
    renderGovernanceSummary();
    renderDetailDrawer();

    const mapTitleEl = document.getElementById('mapTitle');
    if (mapTitleEl) {
      mapTitleEl.textContent = selectedRole === 'jobseeker' ? '求职者视角 · 岗位地图' : '招聘方视角 · 人才地图';
    }

    refreshMapContext();
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

    if (selectedRole === 'jobseeker') {
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
    } else {
      const skillText = (record.skills || []).slice(0, 3).join(' / ') || '综合能力';
      const availabilityText = record.availability || record.jobWillingness || '待定';
      const statusText = record.candidateStatus || '待联系';

      if (experienceGap <= 2) {
        reasons.push(`候选人经验深度与岗位需求相近，约 ${userYears.toFixed(1)} 年经验区间贴合`);
      } else {
        reasons.push('候选人具备一定成长空间，适合在高阶岗位中继续培养');
      }

      reasons.push(`技能栈覆盖 ${skillText}，与岗位要求有较强匹配`);
      reasons.push(`求职状态为 ${availabilityText}，${statusText} 状态利于推进筛选`);
      reasons.push(`沟通反馈与业务背景匹配度较高，适合继续推进面试`);
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
    triggerRecommendationAnimation(scored);
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
    const duplicateSignals = Array.isArray(record.duplicateSignals) && record.duplicateSignals.length
      ? record.duplicateSignals
      : ['无明显重复风险'];

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
      duplicateSignals,
    };
  }

  function buildJobDetailData(record) {
    return {
      title: record.title,
      company: record.company,
      salary: record.salary || `${record.salaryMin}k-${record.salaryMax}k/月`,
      benefits: Array.isArray(record.companyBenefits) && record.companyBenefits.length ? record.companyBenefits : ['五险一金', '弹性工作', '年终奖'],
      experience: record.requiredExperience || (record.yearsOfExperience ? `${Number(record.yearsOfExperience).toFixed(1)}年` : '1-3年'),
      education: record.education || '本科优先',
      workEnvironment: record.workEnvironment || '混合办公 / 可远程 2 天',
      technicalSkills: Array.isArray(record.technicalSkills) && record.technicalSkills.length ? record.technicalSkills : (Array.isArray(record.skills) ? record.skills : ['AI', '产品经理', '增长']),
      urgency: record.urgency || '正常',
      pulse: record.hiringPulseDays ? `近 ${record.hiringPulseDays} 天有招聘动静` : '岗位持续更新',
      skills: Array.isArray(record.skills) ? record.skills : ['AI', '产品经理', '增长'],
      summary: record.jobSummary || `${record.title}岗位关注业务理解、项目落地和协同推进能力，支持Flexible Work 与高成长路径。`,
      jobContent: record.jobContent || '负责业务梳理、需求管理、跨团队协同和落地推进，协助团队实现业务指标与用户价值提升。',
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
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">工作年限</div>
                <div class="mt-2 text-sm font-semibold text-slate-100">${job.experience}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">学历背景</div>
                <div class="mt-2 text-sm font-semibold text-slate-100">${job.education}</div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">技术能力</div>
                <div class="mt-2 flex flex-wrap gap-2">
                  ${job.technicalSkills.map((skill) => `<span class="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100">${skill}</span>`).join('')}
                </div>
              </div>
              <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">工作环境</div>
                <div class="mt-2 text-sm font-semibold text-slate-100">${job.workEnvironment}</div>
              </div>
            </div>
            <div class="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">工作内容</div>
              <div class="mt-2 text-sm leading-7 text-slate-200">${job.jobContent}</div>
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

          <section class="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
            <div class="mb-3 text-[10px] uppercase tracking-[0.18em] text-amber-200">Duplicate Risk</div>
            <div class="space-y-2 text-sm text-amber-50">
              ${(resume.duplicateSignals || ['无明显重复风险']).map((signal) => `<div class="rounded-xl border border-amber-400/30 bg-slate-900/60 px-3 py-2">• ${signal}</div>`).join('')}
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

  function buildGameCompanyJobPosts() {
    const gameJobs = [
      {
        company: '腾讯天美工作室群',
        title: '开放世界设计师',
        salary: '25k-40k/月',
        urgency: '急聘',
        hiringPulseDays: 2,
        requiredExperience: '2-4年',
        education: '本科',
        workEnvironment: '总部办公 / 周三驻场',
        technicalSkills: ['游戏设计', 'UGC系统', '玩法策划', '数据分析'],
        jobContent: '负责开放世界玩法设计、关卡体验优化与用户反馈迭代，推动全新版本内容推进与玩家留存提升。',
        responsibilities: [
          '负责大世界玩法设计、关卡体验优化与用户反馈迭代',
          '参与版本策划和内容排期，推动玩法与系统迭代落地',
          '结合玩家数据和测试反馈持续优化体验与留存表现',
        ],
        companyBenefits: ['五险一金', '年终奖', '免费晚餐'],
      },
      {
        company: '网易游戏',
        title: '游戏运营策划',
        salary: '22k-35k/月',
        urgency: '正在招聘',
        hiringPulseDays: 5,
        requiredExperience: '3-5年',
        education: '本科优先',
        workEnvironment: '混合办公 / 近地铁',
        technicalSkills: ['活动运营', '增长分析', '游戏运营', '用户研究'],
        jobContent: '负责活动策划、用户增长与版本运营策略，结合玩家数据持续提升活跃与转化效果。',
        responsibilities: [
          '负责活动策划和版本运营方案输出',
          '跟踪用户增长和留存指标，推动运营策略持续优化',
          '联动策划、美术、研发团队推进重点活动落地',
        ],
        companyBenefits: ['带薪年假', '团建活动', '弹性工作'],
      },
      {
        company: '米哈游',
        title: '3D 技术美术',
        salary: '28k-45k/月',
        urgency: '急聘',
        hiringPulseDays: 3,
        requiredExperience: '1-3年',
        education: '本科及以上',
        workEnvironment: '弹性办公 / 需现场协作',
        technicalSkills: ['3D建模', '材质制作', 'Unity', 'Maya'],
        jobContent: '负责游戏角色与场景美术效果输出，参与视觉规范制定和资源优化，提升产品整体美术表现。',
        responsibilities: [
          '负责角色、场景等美术资产的制作与优化',
          '协同美术主管和研发团队把控视觉效果与质量标准',
          '持续优化资源流程，提升迭代效率与产品美术统一性',
        ],
        companyBenefits: ['补充医疗', '股权激励', '免费体检'],
      },
      {
        company: '光遇工作室',
        title: '游戏数据分析师',
        salary: '20k-32k/月',
        urgency: '正在招聘',
        hiringPulseDays: 6,
        requiredExperience: '2年以上',
        education: '大专',
        workEnvironment: '近地铁办公 / 周末双休',
        technicalSkills: ['SQL', '数据分析', 'BI', '游戏增长'],
        jobContent: '负责游戏运营数据分析、用户行为研究与增长指标跟踪，支持重点玩法和版本运营决策。',
        responsibilities: [
          '负责用户行为分析和运营指标监控',
          '梳理数据看板并输出增长与留存洞察',
          '为版本迭代和活动策略提供量化参考建议',
        ],
        companyBenefits: ['双休', '餐补', '团队氛围'],
      },
    ];

    return gameJobs.map((job, index) => ({
      ...job,
      id: `game-job-${index + 1}`,
      type: 'job',
      skills: job.technicalSkills,
      jobSummary: job.jobContent,
      recruiter: {
        name: '招聘负责人',
        phone: '13900000000',
        email: 'hr@studio.com',
      },
    }));
  }

  function getJobSkillTokens(job) {
    if (!job) return [];
    const rawSkills = Array.isArray(job.technicalSkills)
      ? job.technicalSkills
      : (Array.isArray(job.skills) ? job.skills : []);
    return rawSkills
      .flatMap((skill) => String(skill).split(/[，,、]/))
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  function renderJobCandidateMatches(job) {
    const candidateList = document.getElementById('jobCandidateList');
    const matchScore = document.getElementById('jobEditorMatchScore');
    const candidateCount = document.getElementById('jobEditorCandidateCount');
    const urgencyBadge = document.getElementById('jobEditorUrgencyBadge');
    const aiTips = document.getElementById('jobEditorAiTips');

    const jobSkills = getJobSkillTokens(job);
    const basePool = Array.isArray(mockData.talents) ? mockData.talents : [];
    const ranked = basePool
      .map((talent) => {
        const talentSkills = Array.isArray(talent.skills) ? talent.skills : [];
        const overlap = talentSkills.filter((skill) => jobSkills.some((item) => item.includes(skill) || skill.includes(item))).length;
        const experienceBonus = Number(String(talent.experience || '1').match(/\d+/)?.[0] || 1);
        const distanceBonus = talent.distanceKm ? Math.max(0, 12 - talent.distanceKm) : 4;
        const salaryScore = talent.salaryValue ? Math.min(20, Math.max(0, talent.salaryValue / 2000)) : 10;
        const score = Math.min(99, Math.max(68, Math.round((overlap * 24) + (experienceBonus * 4) + distanceBonus + salaryScore)));
        return {
          ...talent,
          match: score,
        };
      })
      .sort((a, b) => b.match - a.match)
      .slice(0, 5);

    if (candidateList) {
      candidateList.innerHTML = ranked.map((talent) => `
        <div class="rounded-xl border border-slate-700 bg-slate-950/80 p-2">
          <div class="flex items-center justify-between gap-2">
            <div class="font-medium text-white">${talent.name}</div>
            <span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">${talent.match}%</span>
          </div>
          <div class="mt-1 text-[10px] text-slate-400">${talent.title || '候选人'} · ${talent.experience || '3年经验'}</div>
          <div class="mt-2 flex flex-wrap gap-1">
            ${(Array.isArray(talent.skills) ? talent.skills : []).slice(0, 3).map((skill) => `
              <span class="rounded-full border border-slate-600 bg-slate-800/80 px-1.5 py-0.5 text-[9px] text-slate-200">${skill}</span>
            `).join('')}
          </div>
        </div>
      `).join('');
    }

    if (candidateCount) {
      candidateCount.textContent = String(ranked.length || 0);
    }
    if (matchScore) {
      matchScore.textContent = `${ranked[0]?.match || 92}%`;
    }
    if (urgencyBadge) {
      urgencyBadge.textContent = job?.urgency || '急聘';
      urgencyBadge.className = `rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
        (job?.urgency || '急聘') === '急聘'
          ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
          : 'border-sky-400/30 bg-sky-500/10 text-sky-200'
      }`;
    }
    if (aiTips) {
      const recommendations = [
        `优先突出“${jobSkills.slice(0, 2).join(' / ') || '业务能力'}”相关能力`,
        '强调跨团队协作与数据驱动决策思维',
        '增加弹性办公和成长路径能提升候选人兴趣',
      ];
      aiTips.innerHTML = recommendations.map((text) => `<li>• ${text}</li>`).join('');
    }
  }

  function setEmployerJobForm(job) {
    const companyEl = document.getElementById('jobCompanyInput');
    const titleEl = document.getElementById('jobTitleInput');
    const experienceEl = document.getElementById('jobExperienceInput');
    const educationEl = document.getElementById('jobEducationInput');
    const environmentEl = document.getElementById('jobEnvironmentInput');
    const skillsEl = document.getElementById('jobSkillsInput');
    const responsibilitiesEl = document.getElementById('jobResponsibilityInput');
    const benefitsEl = document.getElementById('jobBenefitsInput');
    const summaryEl = document.getElementById('jobSummaryInput');

    if (!companyEl || !titleEl || !experienceEl || !educationEl || !environmentEl || !skillsEl || !responsibilitiesEl || !benefitsEl || !summaryEl) return;

    const responsibilitiesText = Array.isArray(job?.responsibilities) ? job.responsibilities.join('\n') : '';
    companyEl.value = job?.company || '';
    titleEl.value = job?.title || '';
    experienceEl.value = job?.requiredExperience || '';
    educationEl.value = job?.education || '';
    environmentEl.value = job?.workEnvironment || '';
    skillsEl.value = Array.isArray(job?.technicalSkills) ? job.technicalSkills.join('，') : (Array.isArray(job?.skills) ? job.skills.join('，') : '');
    responsibilitiesEl.value = responsibilitiesText || job?.jobContent || '';
    benefitsEl.value = Array.isArray(job?.companyBenefits) ? job.companyBenefits.join('，') : '';
    summaryEl.value = job?.jobContent || job?.jobSummary || '';
    renderJobCandidateMatches(job);
  }

  function saveEmployerJobFromForm() {
    const companyEl = document.getElementById('jobCompanyInput');
    const titleEl = document.getElementById('jobTitleInput');
    const experienceEl = document.getElementById('jobExperienceInput');
    const educationEl = document.getElementById('jobEducationInput');
    const environmentEl = document.getElementById('jobEnvironmentInput');
    const skillsEl = document.getElementById('jobSkillsInput');
    const responsibilitiesEl = document.getElementById('jobResponsibilityInput');
    const benefitsEl = document.getElementById('jobBenefitsInput');
    const summaryEl = document.getElementById('jobSummaryInput');

    if (!companyEl || !titleEl || !experienceEl || !educationEl || !environmentEl || !skillsEl || !responsibilitiesEl || !benefitsEl || !summaryEl) return;

    const existingJob = selectedEmployerJob || null;
    const nextJob = {
      id: existingJob?.id || `game-job-${Date.now()}`,
      company: companyEl.value.trim() || '公司名称未填写',
      title: titleEl.value.trim() || '岗位名称',
      salary: existingJob?.salary || '20k-35k/月',
      urgency: existingJob?.urgency || '正在招聘',
      hiringPulseDays: existingJob?.hiringPulseDays || 3,
      requiredExperience: experienceEl.value.trim() || '1-3年',
      education: educationEl.value.trim() || '本科',
      workEnvironment: environmentEl.value.trim() || '混合办公',
      technicalSkills: skillsEl.value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) || ['游戏策划'],
      responsibilities: responsibilitiesEl.value.split(/[\n]/).map((item) => item.trim()).filter(Boolean) || ['负责相关业务推进'],
      companyBenefits: benefitsEl.value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) || ['五险一金'],
      jobContent: summaryEl.value.trim() || responsibilitiesEl.value.trim() || '负责相关业务推进与交付。',
      jobSummary: summaryEl.value.trim() || responsibilitiesEl.value.trim() || '负责相关业务推进与交付。',
      type: 'job',
      recruiter: existingJob?.recruiter || { name: '招聘负责人', phone: '13900000000', email: 'hr@studio.com' },
      skills: skillsEl.value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) || ['游戏策划'],
      companyBenefits: benefitsEl.value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) || ['五险一金'],
    };

    const existingIndex = employerJobPosts.findIndex((job) => job.id === nextJob.id);
    if (existingIndex >= 0) {
      employerJobPosts.splice(existingIndex, 1, nextJob);
    } else {
      employerJobPosts.unshift(nextJob);
    }

    selectedEmployerJob = nextJob;
    renderRecruitingPulse();
    renderJobCandidateMatches(nextJob);
    setEmployerJobForm(nextJob);
  }

  function renderEmployerJobEditor() {
    const drawer = document.getElementById('jobPublishDrawer');
    const recruitmentDemandSection = document.getElementById('recruitmentDemandSection');
    if (!drawer) return;

    if (selectedRole !== 'employer') {
      drawer.classList.add('hidden');
      if (recruitmentDemandSection) {
        recruitmentDemandSection.classList.add('hidden');
      }
      return;
    }

    // 需求发布不再在左侧上方占位展示；
    // 正确的交互是：左侧只保留一个“发布岗位”入口，点击后在右侧抽屉中打开编辑器。
    if (recruitmentDemandSection) {
      recruitmentDemandSection.classList.remove('hidden');
    }
    drawer.classList.add('hidden');
    if (!selectedEmployerJob && employerJobPosts.length > 0) {
      selectedEmployerJob = employerJobPosts[0];
    }
    if (selectedEmployerJob) {
      setEmployerJobForm(selectedEmployerJob);
    }
  }

  function openGameJobEditor(job) {
    selectedEmployerJob = job;
    const drawer = document.getElementById('jobPublishDrawer');
    if (!drawer) return;

    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-modal', 'true');
    drawer.onclick = (event) => {
      if (event.target === drawer) {
        closeGameJobEditor();
      }
    };
    setEmployerJobForm(job);
  }

  function closeGameJobEditor() {
    const drawer = document.getElementById('jobPublishDrawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    drawer.removeAttribute('aria-modal');
    drawer.onclick = null;
  }

  function renderRecruitingPulse() {
    const panel = document.getElementById('recruitingPulsePanel');
    const title = document.getElementById('recruitingPulseTitle');
    const section = panel ? panel.closest('section') : null;
    if (!panel) return;

    // 求职者视角下，删除“招聘方动向”板块，避免 UI 中出现与当前角色不一致的内容。
    // 这样既保留招聘方模块的岗位发布能力，又让求职者页面更聚焦在岗位发现与推荐。
    if (section) {
      section.classList.toggle('hidden', selectedRole === 'jobseeker');
    }
    if (selectedRole === 'jobseeker') {
      panel.innerHTML = '';
      return;
    }

    const pulseSource = selectedRole === 'employer'
      ? (employerJobPosts.length ? employerJobPosts : buildGameCompanyJobPosts())
      : [...mockData.jobs];
    const pulseList = pulseSource
      .sort((a, b) => (a.hiringPulseDays || 99) - (b.hiringPulseDays || 99))
      .slice(0, 4)
      .map((job) => {
        const urgency = job.urgency === '急聘' ? '急聘' : '正在招聘';
        const benefitText = Array.isArray(job.companyBenefits) ? job.companyBenefits.slice(0, 2).join(' / ') : '五险一金';
        const isGameJob = selectedRole === 'employer';
        const cardClass = isGameJob
          ? 'cursor-pointer rounded-2xl border border-amber-400/35 bg-amber-500/5 p-2.5 transition hover:border-amber-300/50 hover:bg-amber-500/10'
          : 'rounded-2xl border border-slate-700 bg-slate-900/70 p-2.5';

        return `
          <div class="${cardClass}" data-job-id="${job.id || ''}" data-role="${selectedRole}">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold text-white">${job.company}</div>
              <span class="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-100">${urgency}</span>
            </div>
            <div class="mt-1 text-[11px] text-slate-300">${job.title} · ${job.salary}</div>
            <div class="mt-2 text-[10px] text-slate-400">福利：${benefitText} · 近 ${job.hiringPulseDays || 7} 天有招聘动静</div>
            ${isGameJob ? '<div class="mt-2 text-[10px] text-amber-200">点击可修改岗位内容</div>' : ''}
          </div>
        `;
      })
      .join('');

    if (title) {
      title.textContent = selectedRole === 'jobseeker' ? '招聘方动向' : '岗位发布';
    }

    panel.innerHTML = pulseList || '<div class="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-400">暂无最近招聘动向</div>';

    if (selectedRole === 'employer') {
      panel.querySelectorAll('[data-job-id]').forEach((card) => {
        const jobId = card.getAttribute('data-job-id');
        const job = pulseSource.find((item) => (item.id || '') === jobId);
        if (!job) return;
        card.addEventListener('click', () => openGameJobEditor(job));
      });
    }
  }

  // 更新右侧顶部“AI 推荐榜单”列表：
  // 这里不仅展示最终分数，还展示各因子明细，避免黑箱推荐。
  function syncRolePanels() {
    document.querySelectorAll('.role-panel').forEach((panel) => {
      const role = panel.dataset.rolePanel;
      const shouldShow = role === selectedRole;
      panel.classList.toggle('hidden', !shouldShow);
    });
  }

  function triggerRecommendationAnimation(sortedRecords) {
    const matchBtn = document.getElementById('matchBtn');
    if (matchBtn) {
      matchBtn.classList.add('recommendation-btn--loading');
      matchBtn.disabled = true;
      matchBtn.textContent = '推荐中...';
    }

    if (!map || !sortedRecords || !sortedRecords.length) {
      if (matchBtn) {
        setTimeout(() => {
          matchBtn.classList.remove('recommendation-btn--loading');
          matchBtn.disabled = false;
          matchBtn.textContent = '智能推荐';
        }, 500);
      }
      return;
    }

    const points = sortedRecords.map((record) => [record.lat, record.lng]);
    const bounds = L.latLngBounds(points);
    map.flyToBounds(bounds.pad(0.45), {
      animate: true,
      duration: 0.9,
      maxZoom: 15,
    });

    if (recommendationPulseLayer) {
      recommendationPulseLayer.clearLayers();
      sortedRecords.forEach((record, index) => {
        const ring = L.circle([record.lat, record.lng], {
          radius: 120 + index * 80,
          color: '#fbbf24',
          fillColor: '#fbbf24',
          fillOpacity: 0.1,
          weight: 2,
          opacity: 0.7,
        });
        const pulse = L.circleMarker([record.lat, record.lng], {
          radius: 9 + index,
          color: '#fef3c7',
          fillColor: '#fbbf24',
          fillOpacity: 0.95,
          weight: 3,
        });
        recommendationPulseLayer.addLayer(ring);
        recommendationPulseLayer.addLayer(pulse);
      });

      setTimeout(() => {
        recommendationPulseLayer.clearLayers();
      }, 2000);
    }

    const topRecord = sortedRecords[0];
    const matchedMarker = allMarkers.find((marker) => marker.options?.recordId === topRecord.id);
    if (matchedMarker) {
      setTimeout(() => {
        matchedMarker.openPopup();
      }, 350);
    }

    if (matchBtn) {
      setTimeout(() => {
        matchBtn.classList.remove('recommendation-btn--loading');
        matchBtn.disabled = false;
        matchBtn.textContent = '智能推荐';
      }, 900);
    }
  }

  function renderRecommendationList(sortedRecords) {
    const listEl = selectedRole === 'jobseeker'
      ? document.getElementById('jobSeekerRecommendationList')
      : document.getElementById('employerRecommendationList');
    const titleEl = selectedRole === 'jobseeker'
      ? document.getElementById('jobSeekerRecommendationTitle')
      : document.getElementById('employerRecommendationTitle');
    if (!listEl) return;

    const entityLabel = selectedRole === 'jobseeker' ? 'AI 岗位推荐榜单' : 'AI 人才推荐榜单';
    if (titleEl) {
      titleEl.textContent = entityLabel;
    }

    listEl.innerHTML = '';

    if (!sortedRecords || sortedRecords.length === 0) {
      listEl.innerHTML = `<li class="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-400">暂无${selectedRole === 'jobseeker' ? '岗位' : '人才'}推荐结果</li>`;
      renderRecruitingPulse();
      return;
    }

    sortedRecords.forEach((record, index) => {
      const reasonText = record.reasonSummary || (record.factors || [])
        .slice(0, 3)
        .map((factor) => `${factor.name}:${factor.score}`)
        .join(' · ');
      const primaryText = selectedRole === 'jobseeker' ? (record.title || record.name) : (record.name || record.title);
      const secondaryText = selectedRole === 'jobseeker'
        ? `${record.company || record.source} · ${record.distanceKm}km`
        : `${record.title || record.company} · ${record.distanceKm}km`;
      const badgeText = selectedRole === 'jobseeker' ? '岗位' : '人才';
      const actionLabel = selectedRole === 'jobseeker' ? '查看岗位详情' : '查看候选人简历';

      const item = document.createElement('li');
      item.className = 'rounded-2xl border border-amber-400/25 bg-amber-500/5 px-3 py-2 transition hover:border-amber-300/50 hover:bg-amber-500/10';
      item.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-sm font-semibold text-white">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-950">${index + 1}</span>
              ${primaryText}
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span class="rounded-full border border-slate-600 bg-slate-800/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-200">${badgeText}</span>
              <span>${secondaryText}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[11px] uppercase tracking-[0.16em] text-amber-200">MATCH</div>
            <div class="text-lg font-bold text-amber-300">${record.score}%</div>
          </div>
        </div>
        <div class="mt-2 text-[10px] text-amber-100/80">为什么推荐：${reasonText}</div>
        <div class="mt-3 flex items-center justify-between gap-2">
          <button type="button" class="recommendation-detail-btn rounded-full border border-amber-300/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-100 transition hover:bg-amber-500/20">
            ${actionLabel}
          </button>
          <button type="button" class="recommendation-action-btn rounded-full border border-sky-400/35 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-100 transition hover:bg-sky-500/20">
            ${selectedRole === 'jobseeker' ? '立即申请' : '发起联系'}
          </button>
        </div>
      `;

      const detailButton = item.querySelector('.recommendation-detail-btn');
      const actionButton = item.querySelector('.recommendation-action-btn');

      detailButton.addEventListener('click', (event) => {
        event.stopPropagation();
        selectedRecord = record;
        renderDetailDrawer();
        openResumeModal(record);
      });

      actionButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const actionText = selectedRole === 'jobseeker' ? '已将岗位加入申请清单，后续可直接同步到投递管理。' : '已生成联系邀约，建议在 24 小时内跟进。';
        alert(actionText);
      });

      item.addEventListener('click', () => {
        selectedRecord = record;
        renderDetailDrawer();
        openResumeModal(record);
      });
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

        syncRolePanels();
        syncLocationModeUI();
        refreshMapContext();
        renderHeatZones();
        renderRecruitingPulse();
        renderEmployerJobEditor();
        renderMapData();
        fetchAIRecommendation();
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

    const governanceDrawer = document.getElementById('governanceDrawer');
    if (governanceDrawer) {
      governanceDrawer.addEventListener('click', (event) => {
        if (event.target === governanceDrawer) {
          closeGovernanceDrawer();
        }
      });
    }

    const closeGovernanceDrawerBtn = document.getElementById('closeGovernanceDrawerBtn');
    if (closeGovernanceDrawerBtn) {
      closeGovernanceDrawerBtn.addEventListener('click', closeGovernanceDrawer);
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
      const nextJob = selectedEmployerJob || employerJobPosts[0] || null;
      if (nextJob) {
        selectedEmployerJob = nextJob;
        setEmployerJobForm(nextJob);
      } else {
        selectedEmployerJob = null;
        setEmployerJobForm({
          company: '',
          title: '',
          requiredExperience: '',
          education: '',
          workEnvironment: '',
          technicalSkills: [],
          responsibilities: [],
          companyBenefits: [],
          jobContent: '',
          jobSummary: '',
        });
      }
      openGameJobEditor(selectedEmployerJob || {
        company: '',
        title: '',
        requiredExperience: '',
        education: '',
        workEnvironment: '',
        technicalSkills: [],
        responsibilities: [],
        companyBenefits: [],
        jobContent: '',
        jobSummary: '',
      });
    });

    const closeJobEditorBtn = document.getElementById('closeJobEditorBtn');
    if (closeJobEditorBtn) {
      closeJobEditorBtn.addEventListener('click', closeGameJobEditor);
    }

    const saveEmployerJobBtn = document.getElementById('saveEmployerJobBtn');
    if (saveEmployerJobBtn) {
      saveEmployerJobBtn.addEventListener('click', () => {
        saveEmployerJobFromForm();
        closeGameJobEditor();
        alert('岗位已成功保存，并已同步到招聘地图与招聘榜单。');
      });
    }

    const newEmployerJobBtn = document.getElementById('newEmployerJobBtn');
    if (newEmployerJobBtn) {
      newEmployerJobBtn.addEventListener('click', () => {
        selectedEmployerJob = null;
        setEmployerJobForm({
          company: '',
          title: '',
          requiredExperience: '',
          education: '',
          workEnvironment: '',
          technicalSkills: [],
          responsibilities: [],
          companyBenefits: [],
          jobContent: '',
          jobSummary: '',
        });
      });
    }

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
      const button = document.getElementById('matchBtn');
      if (button && button.disabled) return;
      button?.classList.add('recommendation-btn--loading');
      button && (button.textContent = '推荐中...');
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
    syncRolePanels();
    syncLocationModeUI();

    // 页面首次默认执行 AI 推荐，确保地图上有金色高亮点。
    setTimeout(() => {
      fetchAIRecommendation();
      syncRolePanels();
      syncLocationModeUI();
    }, 120);
  }

  // 确保脚本在页面加载后执行，并在本地静态服务器可直接打开。
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
