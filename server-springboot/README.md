Spring Boot demo server for audio streaming and transcription (demo)

Run locally for testing the frontend streaming pipeline without Gemini.

Requirements:
- Java 17+
- Maven

Start server:

mvn -f server-springboot/pom.xml spring-boot:run

The server exposes a WebSocket at ws://localhost:8080/ws-audio which accepts binary audio chunks from the frontend and emits JSON text messages of the form {
  "type": "partial" | "final",
  "text": "..."
}

Replace the placeholder transcription logic in `AudioWebSocketHandler` with a real Gemini streaming integration that forwards binary audio chunks directly to the Gemini streaming endpoint and relays partial events back to the client.
