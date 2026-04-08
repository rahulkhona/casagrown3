# CasaGrown Architecture Scaling Roadmap
**Target Scale:** 90 Million Active Households (~35% US Market Share)

As CasaGrown transitions from regional pilot functionality to a massive national platform, the architecture pivots from vertical scaling to horizontal, stateless distribution. At 90 Million registered households, we anticipate **10–15 Million Daily Active Users (DAU)** and roughly **2–4 Million Concurrent Users** during harvest season peak hours.

Here is the exact architectural blueprint to gracefully sustain that target volume:

## 1. Network & Frontend Delivery: The Vercel Edge
At national scale, standard centralized monolithic hosting introduces unacceptable geometric latency for users coast-to-coast. 
- **Vercel Enterprise:** The Next.js monolithic frontend is distributed globally via Vercel's Edge Network.
- **Aggressive Edge Caching:** Because the agricultural market is intrinsically read-heavy (users browse 100 tomatoes before executing a single ACID checkout), 99% of browsing traffic is handled directly at the Vercel CDN layer in < 20ms. This prevents the Postgres Database from continuously answering repeat catalog queries.

## 2. Infrastructure: Geographic Database Sharding
At 2-4 Million Concurrent Users, a single Supabase PostgreSQL cluster (e.g. AWS r6g.16xlarge) will become structurally gated by connection pooling limits and Write Ahead Log (WAL) locks. However, the unique advantage of the CasaGrown platform is that **Agricultural commerce is intrinsically Hyper-Local.**
- A farmer in California will never sell literal tomatoes to a buyer in New York without expensive spoiling logistics. Therefore, their raw data records do not need to exist on the same physical hard-drive.
- **The Execution:** We will geographically shard the Supabase backend into regional distinct clusters (e.g., `us-west`, `us-central`, `us-east`). 
- The Next.js Edge Router gracefully identifies the user's IP/Location and immediately proxy-routes their data layer strictly to the regional database closest to them, permanently eliminating monolithic locking lag.

## 3. Real-Time Chat: The Soketi Cluster
The 15-second polling interval and the Supabase (Elixir-based) Realtime engine were designed as phenomenal Day-1 MVP protocols. At national scale, handling 3 Million simultaneous Socket connections is delegated to an isolated external pipe:
- **Soketi Engine (uWebSockets):** Extracted onto a dedicated Kubernetes cluster (e.g. AWS EKS), Soketi handles all stateless Chat connections over C++.
- **Efficiency:** A single Node can safely multiplex 500,000 to 1,000,000 raw TCP sockets.
- **State Management:** The Kubernetes nodes are linked horizontally by a lightweight Redis cluster (AWS ElastiCache). When the PostgreSQL cluster officially commits a Chat Insert to the hard-drive, a Postgres HTTP Trigger `NOTIFY` hook pipes the JSON payload to the Soketi cluster, which instantly multiplexes it across the 3 Million active screens globally.
- *At peak volume, the Database CPU remains functionally idle because Soketi entirely unburdens it from handling active listening requests.*

## 4. Media Storage: Cloudflare Enterprise CDN
Image and Chat-media serving at national scale will consume petabytes of bandwidth. Relying purely on AWS S3 / Supabase Storage bandwidth is cost-prohibitive. All storage buckets will be strictly front-ended by the **Cloudflare CDN** allowing massive horizontal caching for regional imagery.
