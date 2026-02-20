"""
Generate VAPID key pair for Web Push notifications.

Run once:
    python generate_vapid_keys.py

Copy the output into your .env file.
"""
import base64
from py_vapid import Vapid


def main():
    v = Vapid()
    v.generate_keys()

    # Application server key (URL-safe base64, uncompressed EC point)
    pub_nums = v.public_key.public_numbers()
    x_bytes = pub_nums.x.to_bytes(32, "big")
    y_bytes = pub_nums.y.to_bytes(32, "big")
    raw = b"\x04" + x_bytes + y_bytes
    app_server_key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    # Private key PEM (for pywebpush)
    priv_pem = v.private_pem()
    if isinstance(priv_pem, bytes):
        priv_pem = priv_pem.decode()

    print("Add these to your .env:\n")
    print(f"VAPID_PUBLIC_KEY={app_server_key}")
    print(f"VAPID_PRIVATE_KEY={priv_pem}")


if __name__ == "__main__":
    main()
