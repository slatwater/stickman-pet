/**
 * bone-graph.js — 骨架可视化组件（renderer 侧）
 *
 * 在 HTML 层渲染弹出面板，展示已冻结 vs 可塑参数、冻结历史时间线、
 * 骨层行为原则。纯只读展示，不修改任何冻结状态。
 */

function createBoneGraphPanel(container) {
  let visible = false;

  function renderFrozenParam(param, data) {
    const principles = data.principles && data.principles.length > 0
      ? data.principles.map(p => `<li>${p}</li>`).join('')
      : '<li>（暂无）</li>';

    return `
      <div class="bone-param bone-frozen">
        <div class="bone-param-header">
          <span class="bone-param-name">${param}</span>
          <span class="bone-param-value">${data.value}</span>
          <span class="bone-frozen-badge">已固化</span>
        </div>
        <div class="bone-param-context">${data.contextSummary || ''}</div>
        ${data.monologue ? `<div class="bone-param-monologue">"${data.monologue}"</div>` : ''}
        <ul class="bone-param-principles">${principles}</ul>
        <div class="bone-param-time">${data.frozenAt || ''}</div>
      </div>
    `;
  }

  function renderMutableParam(param, value) {
    return `
      <div class="bone-param bone-mutable">
        <div class="bone-param-header">
          <span class="bone-param-name">${param}</span>
          <span class="bone-param-value">${value}</span>
          <span class="bone-mutable-badge">可塑</span>
        </div>
      </div>
    `;
  }

  function renderTimeline(timeline) {
    if (!timeline || timeline.length === 0) {
      return '<div class="bone-timeline-empty">暂无冻结记录</div>';
    }
    return timeline.map(t => `
      <div class="bone-timeline-item">
        <div class="bone-timeline-dot"></div>
        <div class="bone-timeline-content">
          <div class="bone-timeline-param">${t.param} = ${t.value}</div>
          <div class="bone-timeline-time">${t.frozenAt}</div>
          <div class="bone-timeline-ctx">${t.contextSummary}</div>
          ${t.monologue ? `<div class="bone-timeline-mono">"${t.monologue}"</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  return {
    async show() {
      let data = { frozen: {}, mutable: {}, timeline: [] };
      try {
        if (window.electronAPI && window.electronAPI.loadBoneGraph) {
          data = await window.electronAPI.loadBoneGraph() || data;
        }
      } catch (_) {}

      const frozenHtml = Object.keys(data.frozen).length > 0
        ? Object.entries(data.frozen).map(([p, d]) => renderFrozenParam(p, d)).join('')
        : '<div class="bone-empty">暂无固化参数</div>';

      const mutableHtml = Object.keys(data.mutable).length > 0
        ? Object.entries(data.mutable).map(([p, v]) => renderMutableParam(p, v)).join('')
        : '';

      container.innerHTML = `
        <div class="bone-graph-inner">
          <div class="bone-graph-header">
            <span>骨架图谱</span>
            <button class="bone-graph-close" id="bone-graph-close-btn">&times;</button>
          </div>
          <div class="bone-graph-section">
            <h3>固化参数</h3>
            ${frozenHtml}
          </div>
          ${mutableHtml ? `<div class="bone-graph-section"><h3>可塑参数</h3>${mutableHtml}</div>` : ''}
          <div class="bone-graph-section">
            <h3>冻结时间线</h3>
            <div class="bone-timeline">${renderTimeline(data.timeline)}</div>
          </div>
        </div>
      `;

      container.style.display = 'block';
      visible = true;

      const closeBtn = document.getElementById('bone-graph-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
      }

      if (window.electronAPI && window.electronAPI.setIgnoreMouse) {
        window.electronAPI.setIgnoreMouse(false);
      }
    },

    hide() {
      container.style.display = 'none';
      visible = false;
      if (window.electronAPI && window.electronAPI.setIgnoreMouse) {
        window.electronAPI.setIgnoreMouse(true);
      }
    },

    isVisible() {
      return visible;
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createBoneGraphPanel };
}
