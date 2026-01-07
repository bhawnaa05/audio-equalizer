package com.example.audiotranscribe;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;

@Component
public class AudioWebSocketHandler extends BinaryWebSocketHandler {

    private final ObjectMapper mapper = new ObjectMapper();
    private final WebClient webClient;
    private final String geminiApiUrl;
    private final String apiKey;

    // Store audio buffers per session
    private final Map<String, java.io.ByteArrayOutputStream> audioBuffers = new java.util.concurrent.ConcurrentHashMap<>();

    // Constants for audio processing
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNELS = 1;
    private static final int BITS_PER_SAMPLE = 16;
    private static final int BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8; // 2 bytes
    private static final int MAX_SECONDS = 4; // Sliding window size
    private static final int MAX_BUFFER_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * MAX_SECONDS; // ~128KB

    public AudioWebSocketHandler(WebClient.Builder webClientBuilder,
            @org.springframework.beans.factory.annotation.Value("${gemini.project-id}") String projectId,
            @org.springframework.beans.factory.annotation.Value("${gemini.location}") String location,
            @org.springframework.beans.factory.annotation.Value("${gemini.api-key}") String apiKey) {
        this.webClient = webClientBuilder.build();
        this.apiKey = apiKey;
        // Using Gemini 1.5 Flash for speed
        this.geminiApiUrl = String.format(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=%s",
                apiKey);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        super.afterConnectionEstablished(session);
        audioBuffers.put(session.getId(), new java.io.ByteArrayOutputStream());
        System.out.println("Client connected: " + session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, org.springframework.web.socket.CloseStatus status)
            throws Exception {
        super.afterConnectionClosed(session, status);
        audioBuffers.remove(session.getId());
        System.out.println("Client disconnected: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // client sends a JSON "start" message with sample rate
        // We can use this to verify sample rate or reset buffer
        try {
            JsonNode json = mapper.readTree(message.getPayload());
            if ("start".equals(json.path("type").asText())) {
                java.io.ByteArrayOutputStream buffer = audioBuffers.get(session.getId());
                if (buffer != null)
                    buffer.reset();
                System.out.println("DEBUG: Session " + session.getId() + " started new stream");
            }
        } catch (Exception e) {
            System.err.println("Failed to parse text message: " + e.getMessage());
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        java.io.ByteArrayOutputStream buffer = audioBuffers.get(session.getId());
        if (buffer == null)
            return;

        // Append new data
        ByteBuffer payload = message.getPayload();
        byte[] data = new byte[payload.remaining()];
        payload.get(data);

        synchronized (buffer) {
            buffer.write(data);

            // Implement sliding window: if buffer is too big, trim connection
            // For simple implementation, we can convert to array, trim, and recreate.
            // But ByteArrayOutputStream grows. Efficient circular buffer is better but
            // complex.
            // Let's check size.
            if (buffer.size() > MAX_BUFFER_SIZE) {
                byte[] currentBytes = buffer.toByteArray();
                int overflow = currentBytes.length - MAX_BUFFER_SIZE;
                buffer.reset();
                buffer.write(currentBytes, overflow, MAX_BUFFER_SIZE);
            }

            // Send to Gemini
            sendToGemini(session, buffer.toByteArray());
        }
    }

    private void sendToGemini(WebSocketSession session, byte[] pcmData) {
        try {
            byte[] wavData = addWavHeader(pcmData);
            String audioBase64 = java.util.Base64.getEncoder().encodeToString(wavData);

            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(
                            Map.of(
                                    "parts", List.of(
                                            Map.of(
                                                    "inline_data", Map.of(
                                                            "mime_type", "audio/wav",
                                                            "data", audioBase64)),
                                            Map.of("text",
                                                    "Transcribe the spoken English in this audio. Return only the text. If no speech is detected, return an empty string.")))),
                    "generationConfig", Map.of(
                            "candidateCount", 1,
                            "maxOutputTokens", 64)); // Short helper text tokens

            webClient.post()
                    .uri(geminiApiUrl)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .subscribe(response -> handleGeminiResponse(session, response),
                            error -> System.err.println("Gemini API Error: " + error.getMessage()));

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void handleGeminiResponse(WebSocketSession session, String response) {
        try {
            JsonNode root = mapper.readTree(response);
            JsonNode candidates = root.path("candidates");
            if (candidates.isArray() && candidates.size() > 0) {
                JsonNode textNode = candidates.get(0).path("content").path("parts").get(0).path("text");
                if (!textNode.isMissingNode()) {
                    String text = textNode.asText().trim();
                    if (!text.isEmpty()) {
                        // For sliding window, we treat every result as a "partial" update
                        // The UI should display this as the current "hot" text
                        Map<String, String> event = Map.of("type", "partial", "text", text);
                        synchronized (session) {
                            if (session.isOpen()) {
                                session.sendMessage(new TextMessage(mapper.writeValueAsString(event)));
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Response parsing error: " + e.getMessage());
        }
    }

    private byte[] addWavHeader(byte[] pcmData) throws java.io.IOException {
        int totalDataLen = pcmData.length + 36;
        int longSampleRate = SAMPLE_RATE;
        int byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;

        java.io.ByteArrayOutputStream wav = new java.io.ByteArrayOutputStream();

        // RIFF header
        wav.write("RIFF".getBytes());
        wav.write(intToByteArray(totalDataLen));
        wav.write("WAVE".getBytes());
        wav.write("fmt ".getBytes());
        wav.write(intToByteArray(16)); // Subchunk1Size (16 for PCM)
        wav.write(shortToByteArray((short) 1)); // AudioFormat (1=PCM)
        wav.write(shortToByteArray((short) CHANNELS));
        wav.write(intToByteArray(longSampleRate));
        wav.write(intToByteArray(byteRate));
        wav.write(shortToByteArray((short) (CHANNELS * BYTES_PER_SAMPLE))); // BlockAlign
        wav.write(shortToByteArray((short) BITS_PER_SAMPLE));
        wav.write("data".getBytes());
        wav.write(intToByteArray(pcmData.length));

        wav.write(pcmData);
        return wav.toByteArray();
    }

    private byte[] intToByteArray(int i) {
        return new byte[] {
                (byte) (i & 0xff),
                (byte) ((i >> 8) & 0xff),
                (byte) ((i >> 16) & 0xff),
                (byte) ((i >> 24) & 0xff)
        };
    }

    private byte[] shortToByteArray(short s) {
        return new byte[] {
                (byte) (s & 0xff),
                (byte) ((s >> 8) & 0xff)
        };
    }
}
