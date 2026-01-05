from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class AtlassianService(str, Enum):
    jira = "jira"
    confluence = "confluence"


class AtlassianAccountCreate(BaseModel):
    org: str = Field(min_length=1, description="Atlassian org slug")
    email: EmailStr
    api_token: str = Field(min_length=1)


class AtlassianAccount(BaseModel):
    account_id: str
    service: AtlassianService
    org: str
    base_url: str
    email: EmailStr
    created_at: str
    updated_at: str
    last_sync_at: str | None = None


class AtlassianAccountsResponse(BaseModel):
    accounts: list[AtlassianAccount]


class AtlassianSyncResponse(BaseModel):
    job_id: str
    status: str
