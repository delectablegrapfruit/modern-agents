// Icon art for buttons (placeholder until the icon pass): SRPG.icons.draw(ctx, name, size).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  SRPG.icons = {
    names: [],
    draw: function (ctx, name, size) {
      SRPG.draw.roundRect(ctx, 1, 1, size - 2, size - 2, 5, '#ffcc00', '#000', 1);
      SRPG.draw.text(ctx, String(name || '?').slice(0, 3).toUpperCase(), size / 2, size / 2, { size: size / 3.2, align: 'center', baseline: 'middle', color: '#000' });
    },
  };
})();
