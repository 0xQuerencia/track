import type {Phase} from "./clock";
export type PhaseMarker={id:string;phase:Phase;round:number};
export function phaseAlert(previous:PhaseMarker|null,next:PhaseMarker|null):string|null{
  if(!previous||!next||previous.id!==next.id||next.phase==="waiting"||(previous.phase===next.phase&&previous.round===next.round))return null;
  return next.phase==="complete"?"Session complete. Save your focus session.":next.phase==="focus"?"Focus round "+next.round+" begins.":"Time for a break.";
}
