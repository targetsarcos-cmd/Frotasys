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
