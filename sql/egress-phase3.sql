-- Phase 3: run explicitly in a staging database first. No data migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.frotasys_trip_patch_v3(
  p_id text, p_expected timestamptz, p_patch jsonb, p_fields text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_id public.viagens.id%TYPE;
  v_row public.viagens%ROWTYPE;
  v_next jsonb;
  v_now timestamptz;
  v_changed boolean;
  v_projection jsonb;
BEGIN
  IF p_expected IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid patch or version';
  END IF;
  v_id := p_id;
  SELECT * INTO v_row FROM public.viagens WHERE id=v_id FOR UPDATE;
  IF NOT FOUND OR v_row.updated_at IS DISTINCT FROM p_expected THEN RETURN NULL; END IF;
  v_next := coalesce(v_row.dados,'{}'::jsonb) || (p_patch - ARRAY['id','_id','created_at','updated_at','updatedAt','historico']);
  v_changed := v_next IS DISTINCT FROM v_row.dados;
  IF v_changed THEN
    v_now := clock_timestamp();
    UPDATE public.viagens SET dados=v_next || jsonb_build_object('updatedAt',v_now), updated_at=v_now
      WHERE id=v_id RETURNING * INTO v_row;
  END IF;
  SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) INTO v_projection
    FROM jsonb_each(v_row.dados) AS j(k,v) WHERE k=ANY(p_fields) AND k<>'historico';
  RETURN jsonb_build_object('changed',v_changed,'row',v_projection || jsonb_build_object('id',v_row.id,'created_at',v_row.created_at,'updated_at',v_row.updated_at));
END;
$$;
REVOKE ALL ON FUNCTION public.frotasys_trip_patch_v3(text,timestamptz,jsonb,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frotasys_trip_patch_v3(text,timestamptz,jsonb,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.frotasys_trip_dates_v3()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(jsonb_agg(d ORDER BY d),'[]'::jsonb)
  FROM (SELECT DISTINCT dados->>'data' AS d FROM public.viagens WHERE coalesce(dados->>'data','')<>'') AS dates;
$$;
REVOKE ALL ON FUNCTION public.frotasys_trip_dates_v3() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frotasys_trip_dates_v3() TO service_role;
COMMIT;
