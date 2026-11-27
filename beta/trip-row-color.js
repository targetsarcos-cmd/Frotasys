'use strict';
const COLORS = Object.freeze(['orange', 'yellow', 'blue', 'pink']);
function rowColorPatch(color) {
  if (typeof color !== 'string' || (color !== '' && !COLORS.includes(color))) throw new Error('Cor de linha invalida.');
  return { corLinhaBeta:color, marcadoAmarelo:color === 'yellow' };
}
module.exports = { COLORS, rowColorPatch };
