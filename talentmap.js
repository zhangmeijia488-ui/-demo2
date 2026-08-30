(function () {
  // ============================================================
  // talentmap.js：人才地图网格聚合视图
  // ============================================================
  // 核心思想：
  // 1）地图不是看单个候选人，而是看“网格里候选人密度和置信度”；
  // 2）通过区块评分 + 邻域平滑，把小样本噪音降下来；
  // 3）这正是 SpotCrime 的核心逻辑：从点看见区块，再从区块看见趋势。
  // ============================================================

  const TalentMapEngine = {
    buildGridData(records, options = {}) {
      const cellSize = options.cellSize || 0.01;
      const grid = new Map();

      records.forEach((record) => {
        const latCell = Math.floor(record.lat / cellSize);
        const lngCell = Math.floor(record.lng / cellSize);
        const key = `${latCell}:${lngCell}`;

        if (!grid.has(key)) {
          grid.set(key, {
            lat: latCell * cellSize,
            lng: lngCell * cellSize,
            count: 0,
            confidenceSum: 0,
            domains: new Set(),
          });
        }

        const cell = grid.get(key);
        cell.count += 1;
        cell.confidenceSum += record.confidence || 60;
        if (record.title) cell.domains.add(record.title);
      });

      const cells = [...grid.values()].map((cell) => ({
        ...cell,
        confidenceAvg: cell.count ? cell.confidenceSum / cell.count : 0,
        density: cell.count,
        domains: [...cell.domains],
      }));

      return this.smoothNeighborhood(cells, options);
    },

    smoothNeighborhood(cells, options = {}) {
      return cells.map((cell) => {
        const neighbors = cells.filter((other) => {
          const distance = Math.abs(other.lat - cell.lat) + Math.abs(other.lng - cell.lng);
          return distance <= (options.neighborRadius || 0.02);
        });

        const avgDensity = neighbors.reduce((sum, item) => sum + item.density, 0) / Math.max(1, neighbors.length);
        const avgConfidence = neighbors.reduce((sum, item) => sum + item.confidenceAvg, 0) / Math.max(1, neighbors.length);

        return {
          ...cell,
          smoothedDensity: Math.round(avgDensity),
          smoothedConfidence: Math.round(avgConfidence),
          cellWeight: Math.min(1, Math.max(0.2, avgDensity / 10)),
        };
      });
    },

    addGridOverlay(map, records, options = {}) {
      const overlayLayer = L.layerGroup();
      const gridData = this.buildGridData(records, options);

      gridData.forEach((cell) => {
        const radius = 160 + cell.smoothedDensity * 35;
        const circle = L.circle([cell.lat + 0.003, cell.lng + 0.003], {
          radius,
          color: '#f59e0b',
          opacity: 0.25,
          fillOpacity: 0.12 + cell.cellWeight * 0.18,
          weight: 1,
          fillColor: '#f59e0b',
        }).bindPopup(`候选人密度：${cell.smoothedDensity}，置信度：${cell.smoothedConfidence}%`);

        circle.addTo(overlayLayer);
      });

      overlayLayer.addTo(map);
      return overlayLayer;
    },
  };

  window.TalentMapEngine = TalentMapEngine;
})();
