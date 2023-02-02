"use strict";

import { initializeApp } from "firebase/app";
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
} from "firebase/auth";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    setDoc,
    updateDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirebaseConfig } from "./firebase-config.js";

async function signIn() {
    let provider = new GoogleAuthProvider();
    await signInWithPopup(getAuth(), provider);
}

function signOutUser() {
    signOut(getAuth());
}

function initFirebaseAuth() {
    onAuthStateChanged(getAuth(), authStateObserver);
}

function getProfilePicUrl() {
    return getAuth().currentUser.photoURL || "/images/profile_placeholder.png";
}

function getUserName() {
    return getAuth().currentUser.displayName;
}

function isUserSignedIn() {
    return !!getAuth().currentUser;
}

async function saveMessage(messageText) {
    try {
        await addDoc(collection(getFirestore(), "messages"), {
            name: getUserName(),
            text: messageText,
            profilePicUrl: getProfilePicUrl(),
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error writing new message to Firebase Database", error);
    }
}

function loadMessages() {
    const recentMessagesQuery = query(
        collection(getFirestore(), "messages"),
        orderBy("timestamp", "desc"),
        limit(12)
    );

    onSnapshot(recentMessagesQuery, function (snapshot) {
        snapshot.docChanges().forEach(function (change) {
            if (change.type === "removed") {
                deleteMessage(change.doc.id);
            } else {
                let message = change.doc.data();
                displayMessage(
                    change.doc.id,
                    message.timestamp,
                    message.name,
                    message.text,
                    message.profilePicUrl,
                    message.imageUrl
                );
            }
        });
    });
}

async function saveImageMessage(file) {
    try {
        const messageRef = await addDoc(collection(getFirestore(), "messages"), {
            name: getUserName(),
            imageUrl: LOADING_IMAGE_URL,
            profilePicUrl: getProfilePicUrl(),
            timestamp: serverTimestamp(),
        });

        const filePath = `${getAuth().currentUser.uid}/${messageRef.id}/${file.name}`;
        const newImageRef = ref(getStorage(), filePath);
        const fileSnapshot = await uploadBytesResumable(newImageRef, file);

        const publicImageUrl = await getDownloadURL(newImageRef);

        await updateDoc(messageRef, {
            imageUrl: publicImageUrl,
            storageUri: fileSnapshot.metadata.fullPath,
        });
    } catch (error) {
        console.error("There was an error uploading a file to Cloud Storage:", error);
    }
}

async function saveMessagingDeviceToken() {
    try {
        const currentToken = await getToken(getMessaging());
        if (currentToken) {
            console.log("Got FCM device token:", currentToken);
            const tokenRef = doc(getFirestore(), "fcmTokens", currentToken);
            await setDoc(tokenRef, { uid: getAuth().currentUser.uid });

            onMessage(getMessaging(), (message) => {
                console.log(
                    "New foreground notification from Firebase Messaging!",
                    message.notification
                );
            });
        } else {
            requestNotificationsPermissions();
        }
    } catch (error) {
        console.error("Unable to get messaging token.", error);
    }
}

async function requestNotificationsPermissions() {
    console.log("Requesting notifications permission...");
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
        console.log("Notification permission granted.");
        await saveMessagingDeviceToken();
    } else {
        console.log("Unable to get permission to notify.");
    }
}

function onMediaFileSelected(event) {
    event.preventDefault();
    let file = event.target.files[0];

    imageFormElement.reset();

    if (!file.type.match("image.*")) {
        let data = {
            message: "You can only share images",
            timeout: 2000,
        };
        signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
        return;
    }
    if (checkSignedInWithMessage()) {
        saveImageMessage(file);
    }
}

function onMessageFormSubmit(e) {
    e.preventDefault();
    if (messageInputElement.value && checkSignedInWithMessage()) {
        saveMessage(messageInputElement.value).then(function () {
            resetMaterialTextfield(messageInputElement);
            toggleButton();
        });
    }
}

function authStateObserver(user) {
    if (user) {
        let profilePicUrl = getProfilePicUrl();
        let userName = getUserName();

        userPicElement.style.backgroundImage =
            "url(" + addSizeToGoogleProfilePic(profilePicUrl) + ")";
        userNameElement.textContent = userName;

        userNameElement.removeAttribute("hidden");
        userPicElement.removeAttribute("hidden");
        signOutButtonElement.removeAttribute("hidden");

        signInButtonElement.setAttribute("hidden", "true");

        saveMessagingDeviceToken();
    } else {
        userNameElement.setAttribute("hidden", "true");
        userPicElement.setAttribute("hidden", "true");
        signOutButtonElement.setAttribute("hidden", "true");

        signInButtonElement.removeAttribute("hidden");
    }
}

function checkSignedInWithMessage() {
    if (isUserSignedIn()) {
        return true;
    }

    let data = {
        message: "You must sign-in first",
        timeout: 2000,
    };
    signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    return false;
}

function resetMaterialTextfield(element) {
    element.value = "";
    element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
}

let MESSAGE_TEMPLATE =
    '<div class="message-container">' +
    '<div class="spacing"><div class="pic"></div></div>' +
    '<div class="message"></div>' +
    '<div class="name"></div>' +
    "</div>";

function addSizeToGoogleProfilePic(url) {
    if (url.indexOf("googleusercontent.com") !== -1 && url.indexOf("?") === -1) {
        return url + "?sz=150";
    }
    return url;
}

let LOADING_IMAGE_URL = "https://www.google.com/images/spin-32.gif?a";

function deleteMessage(id) {
    let div = document.getElementById(id);
    if (div) {
        div.parentNode.removeChild(div);
    }
}

function createAndInsertMessage(id, timestamp) {
    const container = document.createElement("div");
    container.innerHTML = MESSAGE_TEMPLATE;
    const div = container.firstChild;
    div.setAttribute("id", id);

    timestamp = timestamp ? timestamp.toMillis() : Date.now();
    div.setAttribute("timestamp", timestamp);

    const existingMessages = messageListElement.children;
    if (existingMessages.length === 0) {
        messageListElement.appendChild(div);
    } else {
        let messageListNode = existingMessages[0];

        while (messageListNode) {
            const messageListNodeTime = messageListNode.getAttribute("timestamp");

            if (!messageListNodeTime) {
                throw new Error(`Child ${messageListNode.id} has no 'timestamp' attribute`);
            }

            if (messageListNodeTime > timestamp) {
                break;
            }

            messageListNode = messageListNode.nextSibling;
        }

        messageListElement.insertBefore(div, messageListNode);
    }

    return div;
}

function displayMessage(id, timestamp, name, text, picUrl, imageUrl) {
    let div = document.getElementById(id) || createAndInsertMessage(id, timestamp);

    if (picUrl) {
        div.querySelector(".pic").style.backgroundImage =
            "url(" + addSizeToGoogleProfilePic(picUrl) + ")";
    }

    div.querySelector(".name").textContent = name;
    let messageElement = div.querySelector(".message");

    if (text) {
        messageElement.textContent = text;
        messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, "<br>");
    } else if (imageUrl) {
        let image = document.createElement("img");
        image.addEventListener("load", function () {
            messageListElement.scrollTop = messageListElement.scrollHeight;
        });
        image.src = imageUrl + "&" + new Date().getTime();
        messageElement.innerHTML = "";
        messageElement.appendChild(image);
    }
    setTimeout(function () {
        div.classList.add("visible");
    }, 1);
    messageListElement.scrollTop = messageListElement.scrollHeight;
    messageInputElement.focus();
}

function toggleButton() {
    if (messageInputElement.value) {
        submitButtonElement.removeAttribute("disabled");
    } else {
        submitButtonElement.setAttribute("disabled", "true");
    }
}

let messageListElement = document.getElementById("messages");
let messageFormElement = document.getElementById("message-form");
let messageInputElement = document.getElementById("message");
let submitButtonElement = document.getElementById("submit");
let imageButtonElement = document.getElementById("submitImage");
let imageFormElement = document.getElementById("image-form");
let mediaCaptureElement = document.getElementById("mediaCapture");
let userPicElement = document.getElementById("user-pic");
let userNameElement = document.getElementById("user-name");
let signInButtonElement = document.getElementById("sign-in");
let signOutButtonElement = document.getElementById("sign-out");
let signInSnackbarElement = document.getElementById("must-signin-snackbar");

messageFormElement.addEventListener("submit", onMessageFormSubmit);
signOutButtonElement.addEventListener("click", signOutUser);
signInButtonElement.addEventListener("click", signIn);

messageInputElement.addEventListener("keyup", toggleButton);
messageInputElement.addEventListener("change", toggleButton);

imageButtonElement.addEventListener("click", function (e) {
    e.preventDefault();
    mediaCaptureElement.click();
});
mediaCaptureElement.addEventListener("change", onMediaFileSelected);

const firebaseAppConfig = getFirebaseConfig();
initializeApp(firebaseAppConfig);

initFirebaseAuth();
loadMessages();
