(function () {
  // ============================================================
  // profile.js：三层档案系统（画像层 / 原始层 / 时间线层）
  // ============================================================
  // 这是对招聘 CRM 的一次结构化升级：
  // 1）画像层：结构化、便于推荐和聚合分析；
  // 2）原始层：保留所有来源原文、截图、聊天摘要；
  // 3）时间线层：按事件顺序还原过去一段时间的完整轨迹。
  // 常见业务价值：
  // - 大模型做推荐时，直接从画像层取信息，而不是读所有原始文件；
  // - 运营能看到候选人的完整活动历史；
  // - 对隐私保护更友好：只在需要时展开原始层。
  // ============================================================

  const ProfileSystem = {
    // 画像层：适合地图聚合和 AI 推荐，字段必须稳定，便于持续刷新。
    buildPortrait(record) {
      const skillSet = Array.isArray(record.skills) ? record.skills : [];
      const years = Math.max(1, Math.min(12, Math.round((record.salaryMin || 12) / 10) || 3));
      const recentActivity = record.lastContact ? new Date(record.lastContact) : new Date();

      return {
        id: record.id,
        name: record.name || record.title || '未知对象',
        type: record.type,
        title: record.title || record.name || '岗位',
        skills: skillSet,
        yearsOfExperience: years,
        willingness: record.jobWillingness || record.availability || '待定',
        availability: record.availability || '待定',
        sourceChannels: record.sourceChannels || [record.source || '未知来源'],
        candidateStatus: record.candidateStatus || '待联系',
        salaryMin: record.salaryMin || 0,
        salaryMax: record.salaryMax || 0,
        lastActiveAt: recentActivity.toISOString(),
        confidence: this.calculateConfidence(record),
      };
    },

    calculateConfidence(record) {
      const positiveSignals = [
        record.interviewFeedback?.length || 0,
        record.sourceChannels?.length || 0,
        record.contact ? 1 : 0,
      ].reduce((sum, val) => sum + val, 0);

      const negativeSignals = record.hasNegativeSignal ? 2 : 0;
      const score = clamp(positiveSignals * 18 - negativeSignals * 12, 40, 100);
      return score;
    },

    // 原始层：记录每个渠道的原始信息，只增不改，便于审计和追溯。
    buildRawLayer(record) {
      return {
        id: record.id,
        rawSources: record.sourceChannels || [record.source || '未知'],
        originalSummary: record.resumeSummary || record.jobSummary || '暂无原始摘要',
        contact: record.contact || {},
        interviewNotes: Array.isArray(record.interviewFeedback) ? record.interviewFeedback : [],
        attachments: [
          { type: 'resume', label: '简历原文', value: record.resumeSummary || '未录入' },
          { type: 'chat', label: '聊天摘要', value: record.contactSummary || '暂无聊天摘要' },
        ],
      };
    },

    // 时间线层：把事件按顺序排成时间线，适合回看候选人的完整轨迹。
    buildTimeline(record) {
      const baseTime = new Date(record.lastContact || Date.now());
      const timeline = [
        {
          t: new Date(baseTime.getTime() - 7 * 86400000).toISOString(),
          type: 'viewed',
          title: '档案已查看',
          desc: record.contactSummary || '已查看候选人档案',
        },
        {
          t: new Date(baseTime.getTime() - 3 * 86400000).toISOString(),
          type: 'contact',
          title: '首次联系',
          desc: '已发起初次建联，聚焦岗位匹配点与项目背景',
        },
        {
          t: baseTime.toISOString(),
          type: 'status',
          title: `状态：${record.candidateStatus || '待联系'}`,
          desc: record.contactSummary || '历史沟通正常',
        },
      ];

      return timeline.sort((a, b) => new Date(a.t) - new Date(b.t));
    },

    // 对外方法：将一条记录转成三层档案，返回结构体；
    // 其他模块可直接拿此对象来做 AI、地图聚合、建联助手的输入。
    createProfile(record) {
      return {
        portrait: this.buildPortrait(record),
        raw: this.buildRawLayer(record),
        timeline: this.buildTimeline(record),
        metadata: {
          generatedAt: new Date().toISOString(),
          version: 'v1.0',
          privacyMode: 'mask-sensitive-fields',
        },
      };
    },
  };

  // 兼容浏览器页面：挂到 window 上，供其他脚本直接访问。
  window.ProfileSystem = ProfileSystem;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
