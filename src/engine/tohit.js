// The "To Hit Chart" from the 1984 rulebook, transcribed exactly.
export const RANGE_LABELS = ['0','1','2','3','4-5','6-7','8-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46-50','51+'];
const _ = null;
const pad = (a) => [...a, ...Array(16 - a.length).fill(_)];
export const TO_HIT = {
  photon:    pad([2,3,4,5,6,7,8,9,11,12,13,14,16,17,19,20]),
  beam:      pad([2,3,4,5,6,8,10,12,14,16,18]),
  beamlong:  pad([2,3,4,5,6,8,10,12,14,16,18,18,19,20]), // Type V/VI beams: chart beam row, extended to 45 hexes
  disperser: pad([2,3,4,5,7,10,12,15,18]),
  plasma:    pad([0,2,4,7,9,13,16]),
  cannon:    pad([0,2,4,7,9,13,16]), // designer ruling: range 10, same numbers as plasma
  wltb:      pad([2,3,4,6,8,10,12,14,16,18,20]),
  flare:     pad([2,3,4,5,7,9,10,12,13,14,15,16,18,20]),
  sunburst:  pad([2,3,4,5,6,8,10,12,14,16,18]),
  rocket:    pad([6,5,4,3,2]), // DAMAGE per rocket; rockets never roll to hit
};
export const FORM_NAMES = { photon:'Photon', beam:'Laser Beam I–IV', beamlong:'Laser Beam V–VI', disperser:'Disperser', plasma:'Plasma', cannon:'Cannon', wltb:'WLTB', flare:'Solar Flare', sunburst:'Sunburst', rocket:'Rocket*' };
export const MAX_RANGE = { photon: Infinity, beam: 30, beamlong: 45, disperser: 20, plasma: 10, cannon: 10, wltb: 30, flare: 45, sunburst: 30, rocket: 5 };
export function rangeCol(d) {
  if (d <= 3) return d; if (d <= 5) return 4; if (d <= 7) return 5; if (d <= 10) return 6;
  if (d <= 50) return 7 + Math.floor((d - 11) / 5); return 15;
}
export function chartValue(form, d) { const v = TO_HIT[form][rangeCol(d)]; return v == null ? null : v; }
