import uvicorn
from .config import settings


def main() -> None:
    uvicorn.run("pseudovoice.server:app", host=settings.HOST, port=settings.PORT)


if __name__ == "__main__":
    main()
