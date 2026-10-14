from apps.core.jobs import job
from apps.platform_content.articles import email_due_articles


@job("article_emails")
def article_emails() -> int:
    return email_due_articles()
