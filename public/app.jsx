const { useEffect, useRef, useState } = React;

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const savedVoiceTextRef = useRef("");
  const shouldListenRef = useRef(false);
  const shouldUpdateInputAfterStopRef = useRef(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendMessage(event) {
    event.preventDefault();

    const text = message.trim();

    if (!text) {
      addMessage("error", "Please type a question first.");
      return;
    }

    stopVoiceInput(false);
    setIsLoading(true);
    setMessage("");
    addMessage("user", text);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      addMessage("assistant", data.answer);
    } catch (apiError) {
      addMessage("error", apiError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function addMessage(role, text) {
    setMessages((oldMessages) => [
      ...oldMessages,
      {
        role,
        text
      }
    ]);
  }

  function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addMessage("error", "Voice input is not supported in this browser.");
      return;
    }

    if (isListening) {
      stopVoiceInput();
      return;
    }

    startVoiceInput(SpeechRecognition);
  }

  function startVoiceInput(SpeechRecognition) {
    const recognition = new SpeechRecognition();
    let finalText = "";

    shouldUpdateInputAfterStopRef.current = true;
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      shouldListenRef.current = true;
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;

        if (event.results[index].isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += transcript;
        }
      }

      setMessage(joinVoiceText(savedVoiceTextRef.current, finalText, interimText));
    };

    recognition.onerror = () => {
      addMessage("error", "Could not recognize your voice. Please try again.");
      shouldListenRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      savedVoiceTextRef.current = joinVoiceText(savedVoiceTextRef.current, finalText);

      if (shouldListenRef.current) {
        startVoiceInput(SpeechRecognition);
        return;
      }

      if (shouldUpdateInputAfterStopRef.current) {
        setMessage(savedVoiceTextRef.current);
      } else {
        savedVoiceTextRef.current = "";
        setMessage("");
        shouldUpdateInputAfterStopRef.current = true;
      }

      setIsListening(false);
    };

    savedVoiceTextRef.current = message.trim();
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopVoiceInput(shouldUpdateInput = true) {
    shouldListenRef.current = false;
    shouldUpdateInputAfterStopRef.current = shouldUpdateInput;

    if (!recognitionRef.current) {
      return;
    }

    try {
      recognitionRef.current.stop();
    } catch {
      setIsListening(false);
    }
  }

  function joinVoiceText(...parts) {
    return parts
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return (
    <main className="page">
      <section className="content">
        <div className="chat-icon" aria-hidden="true">
          <span></span>
        </div>

        <h2>Hi there!</h2>
        <h1>What would you like to know?</h1>
        <p>Use one of the most common prompts below<br />or ask your own question</p>

        {(messages.length > 0 || isLoading) && (
          <div className="chat-window">
            {messages.map((chatMessage, index) => (
              <div className={`message-row ${chatMessage.role}`} key={index}>
                <div className="message-bubble">
                  {chatMessage.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message-row assistant">
                <div className="message-bubble">
                  <span className="loader">Waiting for Gemini...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef}></div>
          </div>
        )}

        <form className="input-bar" onSubmit={sendMessage}>
          <button
            className={`mic-button ${isListening ? "active" : ""}`}
            type="button"
            onClick={toggleVoiceInput}
            aria-label={isListening ? "Stop recording" : "Voice input"}
            title={isListening ? "Stop recording" : "Voice input"}
          >
            {isListening ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8h8v8H8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5c0 1.7 1.3 3 3 3Z" />
                <path d="M19 11c0 3.5-3 6-7 6s-7-2.5-7-6" />
                <path d="M12 17v4" />
                <path d="M8 21h8" />
              </svg>
            )}
          </button>

          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={isListening ? "Recording..." : "Ask whatever you want"}
            disabled={isLoading}
          />

          <button className="send-button" type="submit" disabled={isLoading} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </form>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
