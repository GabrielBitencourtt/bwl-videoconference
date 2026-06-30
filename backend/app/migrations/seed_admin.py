import asyncio, asyncpg, bcrypt, secrets, os
EMAIL = "bitencourtpaula.gabriel@gmail.com"
NAME = "Gabriel"


async def main():
    pw = secrets.token_urlsafe(10)
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    res = await conn.execute(
        """INSERT INTO admin_users (email, password_hash, name, role, status)
           VALUES ($1,$2,$3,'superadmin','active')
           ON CONFLICT (email) DO NOTHING""",
        EMAIL, h, NAME,
    )
    await conn.close()
    print("ALREADY_EXISTS" if res.endswith("0") else f"CREATED {pw}")


asyncio.run(main())
