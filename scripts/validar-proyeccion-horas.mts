import {
  ejecutarValidacionesProyeccionHoras,
  formatearResultadoValidacionesProyeccionHoras,
} from "../src/proyeccionHoras/proyeccionHorasValidaciones.ts";

const casos = ejecutarValidacionesProyeccionHoras();
console.log(formatearResultadoValidacionesProyeccionHoras(casos));
if (casos.some((c) => !c.ok)) {
  throw new Error("Validaciones de proyección de horas fallaron");
}
