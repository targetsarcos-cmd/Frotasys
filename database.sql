CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS viagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS config_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viagens_dados_gin ON viagens USING GIN (dados);
CREATE INDEX IF NOT EXISTS idx_metas_dados_gin ON metas USING GIN (dados);
CREATE INDEX IF NOT EXISTS idx_operacoes_dados_gin ON operacoes USING GIN (dados);
CREATE INDEX IF NOT EXISTS idx_config_options_dados_gin ON config_options USING GIN (dados);

CREATE INDEX IF NOT EXISTS idx_viagens_data ON viagens ((dados->>'data'));
CREATE INDEX IF NOT EXISTS idx_viagens_status ON viagens ((dados->>'status'));
CREATE INDEX IF NOT EXISTS idx_viagens_motorista ON viagens ((dados->>'nome'));
CREATE INDEX IF NOT EXISTS idx_viagens_placa ON viagens ((dados->>'placa'));
CREATE INDEX IF NOT EXISTS idx_viagens_origem ON viagens ((dados->>'origem'));
CREATE INDEX IF NOT EXISTS idx_viagens_destino ON viagens ((dados->>'destino'));
CREATE INDEX IF NOT EXISTS idx_viagens_secao ON viagens ((dados->>'secao'));
CREATE INDEX IF NOT EXISTS idx_viagens_cte ON viagens ((dados->>'cte'));
CREATE INDEX IF NOT EXISTS idx_viagens_nota ON viagens ((dados->>'nota'));
CREATE INDEX IF NOT EXISTS idx_viagens_dt ON viagens ((dados->>'dt'));
CREATE INDEX IF NOT EXISTS idx_viagens_num_pedagio ON viagens ((dados->>'num_pedagio'));
CREATE INDEX IF NOT EXISTS idx_metas_data ON metas ((dados->>'data'));
CREATE INDEX IF NOT EXISTS idx_metas_lookup ON metas ((dados->>'data'), (dados->>'destino'), (dados->>'tipo'));
CREATE INDEX IF NOT EXISTS idx_config_options_field ON config_options ((dados->>'field'));
CREATE INDEX IF NOT EXISTS idx_config_options_field_normalized ON config_options ((dados->>'field'), (dados->>'normalized'));

DROP TRIGGER IF EXISTS trg_viagens_updated_at ON viagens;
CREATE TRIGGER trg_viagens_updated_at
BEFORE UPDATE ON viagens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_metas_updated_at ON metas;
CREATE TRIGGER trg_metas_updated_at
BEFORE UPDATE ON metas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_operacoes_updated_at ON operacoes;
CREATE TRIGGER trg_operacoes_updated_at
BEFORE UPDATE ON operacoes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_config_options_updated_at ON config_options;
CREATE TRIGGER trg_config_options_updated_at
BEFORE UPDATE ON config_options
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
