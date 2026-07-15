from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class RoomCreate(BaseModel):
    title: str
    description: Optional[str] = None
    max_participants: int = 50
    is_public: bool = True
    auto_record: bool = False
    lobby_enabled: bool = False
    lobby_timer_title: Optional[str] = None
    lobby_timer_seconds: int = 300
    lobby_bg_video: Optional[str] = None
    lobby_auto_admit: bool = False
    allow_camera: bool = True
    allow_mic: bool = True
    allow_screen_share: bool = True
    allow_whiteboard_edit: bool = False
    require_email: bool = False
    scheduled_at: Optional[datetime] = None
    external_ref: Optional[str] = None
    openpbl_activity_id: Optional[str] = None   # aula OpenPBL: auto-gera o class-code ao entrar
    openpbl_dimensions_id: Optional[str] = None  # aula OpenPBL: dimensionsId p/ o gráfico de riscos
    class_package_url: Optional[str] = None      # URL do Pacote de Classe → QR code p/ os alunos


class RoomOut(BaseModel):
    id: str
    room_id: str
    title: str
    description: Optional[str]
    owner_id: str
    status: str
    max_participants: int
    is_public: bool
    auto_record: bool
    lobby_enabled: bool
    lobby_timer_title: Optional[str]
    lobby_timer_seconds: int
    lobby_bg_video: Optional[str]
    lobby_auto_admit: bool
    guest_token: Optional[str]
    allow_camera: bool
    allow_mic: bool
    allow_screen_share: bool
    allow_whiteboard_edit: bool
    whiteboard_active: bool
    recording_enabled: bool
    recording_url: Optional[str]
    external_ref: Optional[str]
    require_email: bool = False
    openpbl_activity_id: Optional[str] = None
    openpbl_dimensions_id: Optional[str] = None
    class_package_url: Optional[str] = None
    scheduled_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime


class TokenRequest(BaseModel):
    room_id: str                 # DB UUID
    guest_token: Optional[str] = None
    speaker_invite_id: Optional[str] = None
    display_name: Optional[str] = None  # required for guest/speaker
    email: Optional[str] = None         # optional learner e-mail (SCORM/OpenPBL)


class TokenResponse(BaseModel):
    token: str
    livekit_url: str
    identity: str


class ChatMessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    sender_name: Optional[str] = None
    channel: Optional[str] = None   # None = sala principal; groupId = chat do grupo


class LobbyJoin(BaseModel):
    display_name: str
    participant_type: Literal["user", "guest", "speaker"] = "user"


class LobbyDecision(BaseModel):
    admit: bool


class SpeakerInviteCreate(BaseModel):
    label: Optional[str] = None
    allow_camera: bool = True
    allow_mic: bool = True
    allow_screen_share: bool = False
    allow_whiteboard_edit: bool = False
    expires_at: Optional[datetime] = None


class BookingSync(BaseModel):
    """Auto-create a room for a booking. Idempotent on external_ref."""
    external_ref: str
    title: str
    scheduled_at: datetime
    owner_id: str
    lobby_enabled: bool = True


class PermissionUpdate(BaseModel):
    allow_camera: Optional[bool] = None
    allow_mic: Optional[bool] = None
    allow_screen_share: Optional[bool] = None
    allow_whiteboard_edit: Optional[bool] = None
