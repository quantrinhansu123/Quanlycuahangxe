-- Allow managers to cancel an incorrectly recorded payroll payment without
-- deleting the payroll row or losing its audit trail.

CREATE OR REPLACE FUNCTION public.cancel_payroll_payment(
    p_payroll_ids UUID[],
    p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := public.current_app_nhan_su_uuid();
    v_row public.bang_luong%ROWTYPE;
    v_after public.bang_luong%ROWTYPE;
    v_reason TEXT := trim(coalesce(p_reason, ''));
    v_count INTEGER := 0;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    END IF;
    IF NOT public.is_app_payroll_manager() THEN
        RAISE EXCEPTION 'Bạn không có quyền hủy chi trả lương.';
    END IF;
    IF coalesce(array_length(p_payroll_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Chưa chọn phiếu lương cần hủy chi trả.';
    END IF;
    IF length(v_reason) < 3 THEN
        RAISE EXCEPTION 'Lý do hủy chi trả phải có ít nhất 3 ký tự.';
    END IF;

    -- Reuse the protected workflow path so the locked-payroll trigger permits
    -- this narrowly scoped state transition.
    PERFORM set_config('app.payroll_workflow_action', 'true', true);

    FOR v_row IN
        SELECT *
        FROM public.bang_luong
        WHERE id = ANY(p_payroll_ids)
        FOR UPDATE
    LOOP
        IF v_row.trang_thai <> 'Đã chi trả' THEN
            RAISE EXCEPTION 'Chỉ phiếu Đã chi trả mới được hủy chi trả.';
        END IF;

        UPDATE public.bang_luong
        SET trang_thai = 'Đã khóa',
            chi_tra_luc = NULL,
            chi_tra_boi = NULL
        WHERE id = v_row.id
        RETURNING * INTO v_after;

        INSERT INTO public.thong_bao_ung_dung(
            nguoi_nhan_id,
            loai,
            tieu_de,
            noi_dung,
            duong_dan,
            loai_doi_tuong,
            doi_tuong_id,
            tao_boi
        ) VALUES (
            v_row.nhan_su_id,
            'warning',
            'Đã hủy ghi nhận chi trả lương',
            format(
                'Ghi nhận chi trả lương tháng %s/%s đã được hủy. Lý do: %s',
                v_row.thang,
                v_row.nam,
                v_reason
            ),
            format(
                '/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s',
                v_row.thang,
                v_row.nam,
                v_row.id
            ),
            'bang_luong',
            v_row.id,
            v_actor
        );

        INSERT INTO public.bang_luong_lich_su(
            bang_luong_id,
            hanh_dong,
            nguoi_thao_tac_id,
            trang_thai_truoc,
            trang_thai_sau,
            ly_do,
            phien_ban,
            du_lieu_luong
        ) VALUES (
            v_row.id,
            'payment_cancelled',
            v_actor,
            v_row.trang_thai,
            v_after.trang_thai,
            v_reason,
            v_after.phien_ban,
            to_jsonb(v_after)
        );

        v_count := v_count + 1;
    END LOOP;

    IF v_count <> coalesce(array_length(p_payroll_ids, 1), 0) THEN
        RAISE EXCEPTION 'Có phiếu lương không tồn tại hoặc không thuộc phạm vi được phép.';
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payroll_payment(UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_payment(UUID[], TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.cancel_payroll_payment(UUID[], TEXT) IS
    'Cancels a paid payroll record, returns it to locked status, and records the required audit reason.';
