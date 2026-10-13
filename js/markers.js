// Pin artwork from assets/images/. The pictures are big squares with some empty margin
// and a different pin size each, so every pin is cropped to its artwork and anchored on its tip.
window.PipeMarkers = (() => {
  'use strict';

  const DIR = 'assets/images/';
  const PIN_H = 48;   // height of a pin on the map, in px

  // file, picture size, then the left, top, right, bottom edge of the pin inside the picture
  const ART = {
    interruption: ['WATERINTERRUPTION.png', 1254, 195,  83, 1058, 1202],
    maintenance:  ['MAINTENANCE.png',       1254, 195,  89, 1060, 1195],
    pressure:     ['LOWPRESSURE.png',       1254, 191,  98, 1062, 1216],
    quality:      ['WATERQUALITY.png',       500, 121,  78,  380,  433],
    unverified:   ['UNVERIFIED.png',        1254, 168,  48, 1081, 1222],
    verified:     ['VERIFIED.png',          1254, 153,  34, 1099, 1228],
    home:         ['HOMEMARKER.png',        1254, 197,  87, 1056, 1189]
  };

  function geom(key, h) {
    const a = ART[key] || ART.unverified;
    const s = h / (a[5] - a[3]);
    return {
      src: DIR + a[0],
      size: Math.round(a[1] * s * 100) / 100,
      w: Math.round((a[4] - a[2]) * s * 100) / 100,
      h: h,
      left: Math.round(a[2] * s * 100) / 100,
      top: Math.round(a[3] * s * 100) / 100
    };
  }

  function crop(key, h, cls) {
    const g = geom(key, h);
    return `<div class="${cls}" style="width:${g.w}px;height:${g.h}px;` +
      `background:url('${g.src}') -${g.left}px -${g.top}px / ${g.size}px ${g.size}px no-repeat"></div>`;
  }

  return {
    src: (key) => (ART[key] || ART.unverified)[0] ? DIR + (ART[key] || ART.unverified)[0] : '',

    // Leaflet icon for a map pin; cls goes on the element that holds the picture
    divIcon(key, cls) {
      const g = geom(key, PIN_H);
      return L.divIcon({
        className: 'pin-wrap',
        html: crop(key, PIN_H, cls || 'pin-img'),
        iconSize: [g.w, g.h],
        iconAnchor: [g.w / 2, g.h],
        popupAnchor: [0, -(g.h - 4)]
      });
    },

    // small cropped pin for map legends
    legend(key, h) {
      const g = geom(key, h || 25);
      return `<span class="legend-pin" style="width:${g.w}px;height:${g.h}px;` +
        `background:url('${g.src}') -${g.left}px -${g.top}px / ${g.size}px ${g.size}px no-repeat"></span>`;
    }
  };
})();
