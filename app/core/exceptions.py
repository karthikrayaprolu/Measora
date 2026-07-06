from fastapi import HTTPException, status


class SessionNotFoundError(HTTPException):
    def __init__(self, session_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found",
        )


class FrameNotFoundError(HTTPException):
    def __init__(self, frame_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Frame '{frame_id}' not found",
        )


class JobNotFoundError(HTTPException):
    def __init__(self, job_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )


class BrandNotFoundError(HTTPException):
    def __init__(self, brand_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Brand '{brand_id}' not found",
        )


class ProfileNotFoundError(HTTPException):
    def __init__(self, user_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile for user '{user_id}' not found",
        )


class InvalidProductTypeError(HTTPException):
    def __init__(self, product_type: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid product type '{product_type}'. Must be one of: shirt, tshirt, pant, footwear",
        )


class JobNotReadyError(HTTPException):
    def __init__(self, job_type: str):
        super().__init__(
            status_code=status.HTTP_202_ACCEPTED,
            detail=f"'{job_type}' job is still processing. Poll again shortly.",
        )


class MissingFramesError(HTTPException):
    def __init__(self, missing: list):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required pose frames: {missing}",
        )


class FileTooLargeError(HTTPException):
    def __init__(self, max_mb: int):
        super().__init__(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds maximum allowed size of {max_mb} MB",
        )
