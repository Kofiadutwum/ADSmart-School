from django.contrib.auth.hashers import PBKDF2PasswordHasher


class OneTimePasswordHasher(PBKDF2PasswordHasher):
    """Only for the random one-time passwords the school hands out (about 70 bits each): they
    need no deliberately slow hashing, so big imports stay quick. At the first sign-in the
    person chooses their own password, which is stored with the strong default hasher."""

    algorithm = "pbkdf2_onetime"
    iterations = 1000
