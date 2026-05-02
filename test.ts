const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 100);
console.log(typeof timeout);
clearTimeout(timeout);
