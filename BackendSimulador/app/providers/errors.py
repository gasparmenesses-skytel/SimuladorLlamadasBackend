class ProviderError(Exception):
    """Error al hablar con un proveedor de voz, ya traducido a un código HTTP para nuestra API."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
