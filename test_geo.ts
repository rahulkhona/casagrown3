import { geocodeAddress } from './apps/next-market/lib/geocode.ts';

async function main() {
  const res = await geocodeAddress('970 Wallace Dr, San Jose, CA 95120');
  console.log(res);
}
main();
