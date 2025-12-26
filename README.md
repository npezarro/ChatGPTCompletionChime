# Chat-GPT-Completion-Chime

A resilient, background-safe Userscript that plays a pleasant chime when ChatGPT finishes generating a response. Designed for multi-taskers who switch tabs while waiting for long outputs.

## 🌟 Key Features

* **Background-Safe Audio:** Uses a hybrid audio engine. It prioritizes `HTMLAudioElement` (Data URL WAV) which plays reliably even when the tab is throttled or in the background, falling back to `WebAudio` API if necessary.
* **No Timeouts:** Unlike simple timer-based scripts, this will not "give up" on long generations. It waits indefinitely for the UI state to change, making it perfect for long-thinking models (e.g., o1-preview, o1-pro).
* **FSM Logic (Finite State Machine):** Uses a strict logic flow to prevent false positives. It only chimes if it successfully detects that generation started and then finished.
* **Zero External Dependencies:** The audio file is generated programmatically within the script (Base64 WAV). No external requests are made.
* **Battery Efficient:** Uses a 250ms polling rate, ensuring low CPU usage while maintaining responsiveness.

## ⚙️ How It Works (The Logic)

This script does not rely on guessing how long a response will take. It monitors the ChatGPT "Composer" (the input box and send buttons) using a Finite State Machine:

1.  **IDLE:** The script waits for you to press `Enter` or click the `Send` button.
2.  **ARMED:** Once you send a message, the script "arms" itself and begins polling.
3.  **STREAMING:** It looks for the appearance of the **"Stop Generating"** (black square) button. This confirms ChatGPT is actually writing.
4.  **DONE:** The chime triggers **only** when:
    * It previously saw the "Stop" button (state 3).
    * The "Stop" button has disappeared.
    * The text editor is empty (indicating the UI is ready for new input).

## 📥 Installation

1.  Install a userscript manager extension for your browser:
    * **Chrome/Edge:** [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag).
    * **Firefox:** [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) or [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/).
    * **Safari:** [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887).
2.  Create a new script in your manager.
3.  Copy and paste the entire code block into the editor.
4.  Save the script.
5.  Refresh ChatGPT.

## 🔊 Audio Troubleshooting

Modern browsers (Chrome/Safari especially) have strict **Autoplay Policies**. They often block audio contexts created before the user interacts with the page.

* **The Fix:** This script includes an "Unlock" listener. As soon as you click anywhere on the page or type in the box, the audio engine "primes" itself (plays a silent buffer) to satisfy the browser's security requirements.
* **If you hear nothing:** Ensure you have clicked somewhere on the ChatGPT page at least once after loading it.

## 🔧 Compatibility

* **URLs:** `chatgpt.com` and `chat.openai.com`
* **Selectors:** Targeting specific `data-testid` attributes (`send-button`, `stop-button`) and the ProseMirror content editable area to ensure long-term resilience against CSS class changes.

## 📝 Changelog

**v5.4.0**
* Refined FSM logic: strict requirement to see the "Stop" button vanish before chiming.
* Added `editorEmpty()` check to prevent chiming if the user is currently typing while the bot is thinking.
* Implemented "No Timeout" polling.
* Hybrid Audio: Pre-rendered WAV data URI for better background tab performance.
