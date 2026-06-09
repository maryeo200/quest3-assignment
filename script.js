const GEMINI_API_KEY = "AQ.Ab8RN6J1IIR2Ot3M7Ir5Ckxb9oEhlslnAAQrAR6-yPZHaGA0vQ";
const GEMINI_MODEL = "gemini-2.0-flash";

const homeScreen = document.getElementById("homeScreen");
const chatScreen = document.getElementById("chatScreen");
const orderScreen = document.getElementById("orderScreen");
const voiceLauncher = document.getElementById("voiceLauncher");
const chatBackButton = document.getElementById("chatBackButton");
const orderBackButton = document.getElementById("orderBackButton");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const chatLog = document.getElementById("chatLog");
const confirmOrderButton = document.getElementById("confirmOrderButton");
const cancelOrderButton = document.getElementById("cancelOrderButton");
const restartButton = document.getElementById("restartButton");
const orderContent = document.querySelector(".order-content");
const orderComplete = document.getElementById("orderComplete");

const conversation = [];
let latestProducts = [];
let isWaiting = false;

const SYSTEM_PROMPT = `
You are the real AI shopping assistant inside a university class project named Coupang PRO.
This application is only a simulation and is not connected to Coupang or any real store.

Rules:
1. Always reply in English.
2. Every product, brand, price, review, stock status, and delivery estimate must be fictional.
3. Never imply that you searched a real store or that a product really exists.
4. When the user asks for recommendations, normally return about 3 fictional products.
5. Each product must have a name, short description, price, delivery time, and one transparent recommendation reason.
6. Prioritize the user's preferences, price, accessibility, clarity, fictional reviews, and delivery time. Never prioritize sponsorship.
7. Remember the conversation. Follow requests such as "show me a cheaper one" or "I want faster delivery."
8. Do not start an order merely because you recommended products.
9. Set orderRequested to true only when the user explicitly asks to order, buy, purchase, or proceed with one product.
10. When orderRequested is true, fill selectedProduct with the product the user chose. If their choice is ambiguous, ask which product and keep orderRequested false.
11. Always remind the user that recommendations and orders are simulated.
`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Natural English conversational reply to show in the chat."
    },
    products: {
      type: "array",
      description: "Fictional recommendations for this turn. Empty when no new recommendations are needed.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
          delivery: { type: "string" },
          reason: { type: "string" }
        },
        required: ["name", "description", "price", "delivery", "reason"]
      }
    },
    orderRequested: {
      type: "boolean",
      description: "True only when the user explicitly requests an order for a specific product."
    },
    selectedProduct: {
      type: "object",
      description: "Chosen fictional product. Use empty strings when orderRequested is false.",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "string" },
        delivery: { type: "string" },
        reason: { type: "string" }
      },
      required: ["name", "description", "price", "delivery", "reason"]
    }
  },
  required: ["reply", "products", "orderRequested", "selectedProduct"]
};

voiceLauncher.addEventListener("click", () => {
  showScreen(chatScreen);
  setTimeout(() => chatInput.focus(), 100);
});

chatBackButton.addEventListener("click", () => showScreen(homeScreen));
orderBackButton.addEventListener("click", () => showScreen(chatScreen));
cancelOrderButton.addEventListener("click", () => showScreen(chatScreen));

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const userText = chatInput.value.trim();

  if (!userText || isWaiting) {
    return;
  }

  chatInput.value = "";
  addTextMessage("user", userText);
  conversation.push({ role: "user", parts: [{ text: userText }] });
  await requestGeminiResponse();
});

confirmOrderButton.addEventListener("click", () => {
  orderContent.hidden = true;
  orderComplete.hidden = false;
});

restartButton.addEventListener("click", () => {
  orderContent.hidden = false;
  orderComplete.hidden = true;
  showScreen(homeScreen);
});

function showScreen(targetScreen) {
  [homeScreen, chatScreen, orderScreen].forEach((screen) => {
    screen.classList.toggle("is-active", screen === targetScreen);
  });
  window.scrollTo(0, 0);
}

async function requestGeminiResponse() {
  if (GEMINI_API_KEY === "PASTE_YOUR_FREE_GEMINI_API_KEY_HERE") {
    addTextMessage(
      "assistant error",
      "The Gemini API key is not set yet. Put your free Google AI Studio API key in the GEMINI_API_KEY variable at the top of script.js."
    );
    conversation.pop();
    return;
  }

  setWaiting(true);
  const typingBubble = addTextMessage("assistant typing", "AI is comparing fictional shopping options...");

  try {
    const result = await callGeminiAPI();
    typingBubble.remove();

    addTextMessage("assistant", result.reply);
    conversation.push({
      role: "model",
      parts: [{ text: buildConversationSummary(result) }]
    });

    if (result.products.length > 0) {
      latestProducts = result.products;
      renderProducts(result.products);
    }

    if (result.orderRequested && result.selectedProduct.name.trim()) {
      populateOrderScreen(result.selectedProduct);
      setTimeout(() => showScreen(orderScreen), 450);
    }
  } catch (error) {
    typingBubble.remove();
    addTextMessage(
      "assistant error",
      `AI connection failed. Please check the API key and internet connection.\nError: ${error.message}`
    );
    console.error(error);
  } finally {
    setWaiting(false);
  }
}

async function callGeminiAPI() {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  // The real Gemini AI request happens here with the browser Fetch API.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: conversation,
      generationConfig: {
        temperature: 0.75,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA
      }
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini ${response.status}: ${details.slice(0, 160)}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(responseText);
  parsed.products = Array.isArray(parsed.products) ? parsed.products : [];
  return parsed;
}

function buildConversationSummary(result) {
  const productSummary = result.products
    .map((product, index) => (
      `${index + 1}. ${product.name} / ${product.price} / ${product.delivery} / ${product.reason}`
    ))
    .join("\n");

  return productSummary ? `${result.reply}\nRecommended products:\n${productSummary}` : result.reply;
}

function addTextMessage(type, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

function renderProducts(products) {
  const list = document.createElement("section");
  list.className = "product-results";
  list.setAttribute("aria-label", "AI fictional product recommendations");

  products.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "ai-product";

    const title = document.createElement("h3");
    title.textContent = `${index + 1}. ${product.name}`;

    const description = document.createElement("p");
    description.textContent = product.description;

    const price = document.createElement("p");
    price.className = "price";
    price.textContent = product.price;

    const delivery = document.createElement("p");
    delivery.textContent = `Delivery: ${product.delivery}`;

    const reason = document.createElement("p");
    reason.className = "reason";
    reason.textContent = `Reason: ${product.reason}`;

    card.append(title, description, price, delivery, reason);
    list.appendChild(card);
  });

  chatLog.appendChild(list);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function populateOrderScreen(product) {
  document.getElementById("orderProductName").textContent = product.name;
  document.getElementById("orderProductDescription").textContent = product.description;
  document.getElementById("orderPrice").textContent = product.price;
  document.getElementById("orderDelivery").textContent = product.delivery;
  document.getElementById("orderReason").textContent = product.reason;
  orderContent.hidden = false;
  orderComplete.hidden = true;
}

function setWaiting(waiting) {
  isWaiting = waiting;
  sendButton.disabled = waiting;
  chatInput.disabled = waiting;
}
