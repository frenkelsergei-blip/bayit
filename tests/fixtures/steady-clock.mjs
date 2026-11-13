// Keeps a test inside one rate-limit window. Bayit's limits count per fixed window of the clock (security.mjs limit():
// Math.floor(Date.now()/period) for 1 minute, 15 minutes and 1 day; Maps usage per minute). A test that makes N
// requests and expects the (N+1)th to be refused fails when the run happens to cross a window change, because the count
// restarts (seen once in the 1.75.0 security job). The limiter itself is unchanged: only the test's clock is held.
//
// Like tests/riseup-session.test.mjs, this replaces Date.now for the duration of `fn`: the clock starts 1 second after
// the beginning of the current 15-minute window (which is also the start of a minute and inside the same day) and moves
// 1 ms per read, so a test has about 59 seconds of reads before it could reach the next minute.
export const WINDOW_START_MS=900000;
export async function steadyClock(fn,{now=Date.now()}={}){
 const real=Date.now,base=Math.floor(now/WINDOW_START_MS)*WINDOW_START_MS+1000;let reads=0;
 Date.now=()=>base+(++reads);
 try{return await fn()}finally{Date.now=real}
}
