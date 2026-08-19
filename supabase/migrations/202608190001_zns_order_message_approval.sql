-- Hàng đợi tin Zalo xác nhận đơn hàng. Đơn chỉ được gửi khi quản trị viên duyệt.
CREATE TABLE IF NOT EXISTS public.zns_order_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.the_ban_hang(id) ON DELETE CASCADE,
    order_code TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT,
    service_name TEXT NOT NULL DEFAULT '',
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'cho_duyet' CHECK (status IN ('cho_duyet', 'da_gui', 'that_bai')),
    send_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ,
    zalo_msg_id TEXT,
    last_error TEXT,
    created_by TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_zns_order_message_queue_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_zns_order_message_queue_status_created
    ON public.zns_order_message_queue (status, created_at DESC);

ALTER TABLE public.zns_order_message_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'zns_order_message_queue'
          AND policyname = 'Allow all actions for zns_order_message_queue'
    ) THEN
        CREATE POLICY "Allow all actions for zns_order_message_queue"
            ON public.zns_order_message_queue FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_zns_order_message_queue_updated_at ON public.zns_order_message_queue;
CREATE TRIGGER update_zns_order_message_queue_updated_at
    BEFORE UPDATE ON public.zns_order_message_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
