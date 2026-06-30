from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/video_rooms"

    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = "ws://localhost:7880"          # client-facing (ws/wss)
    livekit_host_url: str = "http://localhost:7880"   # server-side REST

    # Recording storage (S3 / MinIO)
    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "recordings"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_public_base: str = "http://localhost:9000/recordings"

    # Public URL where the frontend serves the headless recording page
    recording_view_base_url: str = "http://localhost:5173/recording-view"

    cors_origins: str = "*"

    # Tenancy / admin
    default_tenant_slug: str = "openpbl"   # used when no API key is presented (existing app)
    admin_jwt_secret: str = "change-me-admin-secret"   # signs admin panel sessions
    node_secret: str = ""                  # shared secret for node agents → /api/internal/nodes

    # Finance / modelo de custo (Lightsail fixo sa-east-1 + S3 variável).
    # Ajuste se redimensionar instâncias ou mudar de região/preço.
    cost_app_usd: float = 24.0             # bwl-app (medium_3_1: 2 vCPU / 4 GB)
    cost_livekit_usd: float = 44.0         # bwl-livekit (large_3_1: 2 vCPU / 8 GB)
    cost_egress_usd: float = 84.0          # bwl-egress (xlarge_3_1: 4 vCPU / 16 GB)
    cost_s3_per_gb_usd: float = 0.0405     # S3 Standard sa-east-1 (1ª faixa)
    usd_to_brl: float = 5.40               # câmbio para exibição em BRL

    # Integração OpenPBL (SCORM): progresso dos alunos vem do LRS de interações.
    scorm_lrs_url: str = "https://ltiserver.openpbl.ai"   # GET /interaction-events
    scorm_tenant_slugs: str = "openpbl"    # tenants (slug, csv) que têm a integração ativa


settings = Settings()
