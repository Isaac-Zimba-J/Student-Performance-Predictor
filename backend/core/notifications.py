"""
Email notification helper.

Uses Python's built-in smtplib. Falls back to structured logging
when EMAIL_ENABLED=False (the default for dev environments).
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send a plain-text email. Returns True on success, False on failure.
    Falls back to logging if EMAIL_ENABLED is False.
    """
    settings = get_settings()

    if not settings.EMAIL_ENABLED:
        log.warning(f"[EMAIL → {to}] Subject: {subject}\n{body}")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())

        log.info(f"Email sent to {to}: {subject}")
        return True

    except Exception as e:
        log.error(f"Failed to send email to {to}: {e}")
        return False
