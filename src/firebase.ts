import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCw7aQ-iumqGw2prfSr-s8hpAAtgz_uJag',
  authDomain: 'golake-catspot.firebaseapp.com',
  projectId: 'golake-catspot',
  storageBucket: 'golake-catspot.firebasestorage.app',
  messagingSenderId: '414666364034',
  appId: '1:414666364034:web:1c7fca3dfb15b65d59d09b',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)