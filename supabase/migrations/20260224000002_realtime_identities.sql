-- By default, Supabase Realtime only broadcasts the primary key of the OLD row during an UPDATE event.
-- The RealtimeNotificationListener React hook relies on checking old.status vs new.status to ensure
-- we don't accidentally send duplicate toasts (e.g. if an already 'completed' order is updated because
-- a user left feedback, we shouldn't show the "Order Completed" toast again).
--
-- Setting REPLICA IDENTITY FULL ensures the entire old row structure is broadcast over the WebSocket.

ALTER TABLE public.delegations REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
