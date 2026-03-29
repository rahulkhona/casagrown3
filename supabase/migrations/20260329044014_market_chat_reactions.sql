-- Create market_chat_reactions
CREATE TABLE public.market_chat_reactions (
    message_id UUID NOT NULL REFERENCES public.market_chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (char_length(emoji) > 0 AND char_length(emoji) <= 10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.market_chat_reactions ENABLE ROW LEVEL SECURITY;

-- Select Policy: Users can view reactions if they can view the message (i.e. they are part of the conversation)
CREATE POLICY "Users can view reactions in their conversations" ON public.market_chat_reactions 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.market_chat_messages m
    JOIN public.market_conversations c ON m.conversation_id = c.id
    WHERE m.id = market_chat_reactions.message_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

-- Insert Policy: Users can insert their own reactions if they are participants
CREATE POLICY "Users can insert their own reactions" ON public.market_chat_reactions 
FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.market_chat_messages m
    JOIN public.market_conversations c ON m.conversation_id = c.id
    WHERE m.id = market_chat_reactions.message_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

-- Delete Policy: Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions" ON public.market_chat_reactions 
FOR DELETE USING (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.market_chat_messages m
    JOIN public.market_conversations c ON m.conversation_id = c.id
    WHERE m.id = market_chat_reactions.message_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_chat_reactions;
