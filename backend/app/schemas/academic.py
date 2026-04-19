from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class GradeBase(BaseModel):
    level: int
    name: str

class GradeCreate(GradeBase):
    pass

class GradeUpdate(BaseModel):
    level: Optional[int] = None
    name: Optional[str] = None

class GradeResponse(GradeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SectionBase(BaseModel):
    name: str

class SectionCreate(SectionBase):
    grade_id: int

class SectionUpdate(BaseModel):
    name: Optional[str] = None
    grade_id: Optional[int] = None

class SectionResponse(SectionBase):
    id: int
    grade_id: int
    model_config = ConfigDict(from_attributes=True)

class SubjectBase(BaseModel):
    name: str
    code: str

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None

class SubjectResponse(SubjectBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SchoolClassBase(BaseModel):
    display_name: Optional[str] = None

class SchoolClassCreate(SchoolClassBase):
    grade_id: int
    section_id: int

class SchoolClassUpdate(BaseModel):
    display_name: Optional[str] = None
    grade_id: Optional[int] = None
    section_id: Optional[int] = None

class SchoolClassResponse(SchoolClassBase):
    id: int
    grade: GradeResponse
    section: SectionResponse
    model_config = ConfigDict(from_attributes=True)
