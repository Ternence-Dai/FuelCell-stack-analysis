import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daily_report


class EmailDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {
            "SMTP_USERNAME": "sender@example.com",
            "SMTP_PASSWORD": "test-only-password",
            "REPORT_RECIPIENT": "reader@example.com",
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "465",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    @mock.patch.object(daily_report.smtplib, "SMTP_SSL")
    def test_send_email_logs_in_and_submits_message(self, smtp_ssl):
        server = smtp_ssl.return_value.__enter__.return_value
        server.send_message.return_value = {}

        daily_report.send_email("Test subject", "<p>Preview body</p>")

        smtp_ssl.assert_called_once()
        server.login.assert_called_once_with("sender@example.com", "test-only-password")
        message = server.send_message.call_args.args[0]
        self.assertEqual(message["To"], "reader@example.com")
        self.assertEqual(message["Subject"], "Test subject")
        self.assertTrue(message.get_body(preferencelist=("html",)).get_content().find("Preview body") >= 0)

    @mock.patch.object(daily_report.smtplib, "SMTP_SSL")
    def test_refused_recipient_fails_without_exposing_address(self, smtp_ssl):
        server = smtp_ssl.return_value.__enter__.return_value
        server.send_message.return_value = {"reader@example.com": (550, b"mailbox unavailable")}

        with self.assertRaisesRegex(RuntimeError, "SMTP refused recipient") as raised:
            daily_report.send_email("Test subject", "<p>Body</p>")

        self.assertNotIn("reader@example.com", str(raised.exception))

    @mock.patch.object(daily_report.smtplib, "SMTP_SSL")
    def test_missing_credentials_fail_before_opening_smtp(self, smtp_ssl):
        with mock.patch.dict(os.environ, {"SMTP_PASSWORD": ""}):
            with self.assertRaisesRegex(RuntimeError, "Missing SMTP_USERNAME"):
                daily_report.send_email("Test subject", "<p>Body</p>")
        smtp_ssl.assert_not_called()

    @mock.patch.object(daily_report.smtplib, "SMTP_SSL")
    def test_invalid_recipient_fails_before_opening_smtp(self, smtp_ssl):
        with mock.patch.dict(os.environ, {"REPORT_RECIPIENT": "not-an-email"}):
            with self.assertRaisesRegex(RuntimeError, "REPORT_RECIPIENT"):
                daily_report.send_email("Test subject", "<p>Body</p>")
        smtp_ssl.assert_not_called()


if __name__ == "__main__":
    unittest.main()
