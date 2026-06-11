"""S3 upload utility - uses AWS_ACCESS_KEY_ID/SECRET from env. Falls back gracefully when not configured."""
import os
import uuid
from fastapi import HTTPException


def is_configured() -> bool:
    return bool(os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"))


def get_client():
    import boto3
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "ap-south-1"),
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def upload_bytes(data: bytes, content_type: str, folder: str = "uploads") -> str:
    """Upload bytes to S3 and return the public URL."""
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="S3 not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to backend/.env",
        )
    bucket = os.environ["S3_BUCKET_NAME"]
    ext = content_type.split("/")[-1] if "/" in content_type else "bin"
    if ext in ("jpeg",):
        ext = "jpg"
    key = f"{folder}/{uuid.uuid4().hex}.{ext}"
    client = get_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    region = os.environ.get("AWS_REGION", "ap-south-1")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
