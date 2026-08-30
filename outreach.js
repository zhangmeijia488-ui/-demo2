(function () {
  // ============================================================
  // outreach.js：建联助手（AI / 模板双通道）
  // ============================================================
  // 目标：
  // 1）给猎头和招聘负责人提供背景摘要；
  // 2）提炼切入点和建联主线；
  // 3）生成一份可编辑的初稿；
  // 4）保证「AI 不替人说话」：必须经猎头确认后才能送出。
  // ============================================================

  const OutreachAssistant = {
    // 生成背景 360° 摘要：只基于已授权沉淀信息，不引入敏感字段。
    generateBackgroundSummary(profile, job) {
      const portrait = profile?.portrait || {};
      const jobTitle = job?.title || '相关岗位';
      const skills = (portrait.skills || []).slice(0, 4).join(' / ') || '综合能力';
      const status = portrait.candidateStatus || '待联系';
      const salary = portrait.salaryMin ? `${portrait.salaryMin}k-${portrait.salaryMax || portrait.salaryMin}k` : '薪资待定';

      return `候选人 ${portrait.name || '匿名候选人'} 目前处于${status}状态，当前定位为${jobTitle}相关岗位，核心能力聚焦于${skills}；近 90 天活跃度较高，薪资期望区间为${salary}。其背景与岗位匹配点集中在业务理解、项目落地与跨团队协同。`;
    },

    // 提炼切入点：只用业务相关信息，避免敏感字段侵入。
    extractConnectionPoints(profile, job) {
      const portrait = profile?.portrait || {};
      const jobSkills = job?.skills || [];
      const profileSkills = portrait.skills || [];

      const overlaps = jobSkills.filter((skill) => profileSkills.includes(skill));
      const sharedDomains = jobSkills.filter((skill) => !profileSkills.includes(skill)).slice(0, 2);

      return {
        overlapSkills: overlaps,
        potentialValue: overlaps.length ? '岗位匹配度高，具备直接复用技能' : '背景与岗位方向相符，值得进一步确认细节',
        openingLine: overlaps.length
          ? `我看到你在${overlaps.slice(0, 2).join(' / ')}方向有较强积累，和我们当前${job?.title || '岗位'}非常贴合。`
          : `我想了解你对${job?.title || '当前岗位'}的兴趣和落地意愿，我们这边更关注业务执行和团队协同。`,
        sharedDomains,
      };
    },

    // 生成建联初稿：模板 + 档案参数填充，便于操作但必须留给猎头确认。
    generateOutreachDraft(profile, job) {
      const profileInfo = profile?.portrait || {};
      const points = this.extractConnectionPoints(profile, job);
      const firstSentence = points.openingLine;
      const summary = this.generateBackgroundSummary(profile, job);
      const candidateName = profileInfo.name || '候选人';
      const position = job?.title || '相关岗位';
      const skillsText = (points.overlapSkills.length
        ? `你在 ${points.overlapSkills.join(' / ')} 方面的深度很符合我们当前 ${position} 的要求。`
        : `你的项目经验与岗位方向相符，尤其在业务落地和协同执行方面很有价值。`);

      return {
        draft: [
          `Hi ${candidateName}，${firstSentence}`,
          `我看了你的背景，${summary}`,
          skillsText,
          `如果你对 ${position} 感兴趣，欢迎进一步聊聊你的近况和岗位关注点。我们会基于岗位职责和工作节奏做匹配，不强制你接受任何不合适的机会。`,
          '如果你方便，接下来我可以同步给你更具体的岗位信息和面试安排。',
        ].join('\n\n'),
        softConstraints: [
          'AI 仅生成草稿，必须经猎头编辑确认后再发送',
          '严格禁用婚育、籍贯等敏感字段',
          '发送后自动记为首次建联，并同步到事件时间线',
        ],
      };
    },

    // 7天无回复提醒：用于工作台待办，不直接改状态，避免误判。
    buildFollowUpReminders(records) {
      const now = Date.now();
      return records.filter((record) => {
        const last = new Date(record.lastContact || record.publishedAt || Date.now()).getTime();
        const days = (now - last) / 86400000;
        return days > 7 && (record.candidateStatus || '待联系') !== 'offer';
      }).map((record) => ({
        id: record.id,
        name: record.name || record.title,
        reminder: `超过 7 天未回复，建议猎头重新跟进`,
        dueInDays: Math.max(1, Math.round(7 - (now - new Date(record.lastContact || record.publishedAt).getTime()) / 86400000)),
      }));
    },

    // 批量打标签：Demo 中以简单规则展示，不做复杂抽象层。
    bulkTag(records, tagSet) {
      return records.map((record) => ({
        ...record,
        tags: Array.from(new Set([...(record.tags || []), ...tagSet])),
      }));
    },
  };

  window.OutreachAssistant = OutreachAssistant;
})();
