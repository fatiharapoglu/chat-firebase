const config = {
    apiKey: "AIzaSyDx27TsKeCD_uB3VVgs_aqS5UAopNdKQGA",
    authDomain: "chat-firebase-2c12e.firebaseapp.com",
    projectId: "chat-firebase-2c12e",
    storageBucket: "chat-firebase-2c12e.appspot.com",
    messagingSenderId: "451958573552",
    appId: "1:451958573552:web:63cb62b8fd5cbef4c97535",
};

export function getFirebaseConfig() {
    if (!config || !config.apiKey) {
        throw new Error(
            "No Firebase configuration object provided." +
                "\n" +
                "Add your web app's configuration object to firebase-config.js"
        );
    } else {
        return config;
    }
}
