export const MAX_LEASE_MS=75000;
/** An automatic block has a short, renewable local lease and cannot outlast a reported focus phase. */
export function focusLease(response,now,roundTripMs=0){
  if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(roundTripMs)||roundTripMs<0||roundTripMs>10000)return 0;
  if(response?.ok!==true||response.active!==true||response.phase!=="focus"||response.paused!==false||!Number.isSafeInteger(response.remainingMs)||response.remainingMs<=0)return 0;
  const remaining=Math.floor(response.remainingMs-roundTripMs);
  return remaining>0?now+Math.min(remaining,MAX_LEASE_MS):0;
}
