import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, writeBatch, query, getDocs, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, signOut, linkWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';

const genToken = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
const CACHE_KEY = (uid) => `cards_cache_${uid}`;
const REV_KEY = (uid) => `cache_rev_${uid}`;

export function useCards() {
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const localRevRef = useRef(null);
  const uidRef = useRef(null);

  const fullSync = useCallback(async (currentUid, serverRev) => {
    try {
      const cardsRef = collection(db, 'users', currentUid, 'cards');
      const snapshot = await getDocs(query(cardsRef));
      let fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

      const localRaw = localStorage.getItem('mnemonic_user_cards');
      if (localRaw && fetched.length === 0) {
        const localCards = JSON.parse(localRaw);
        if (localCards.length > 0) {
          const batch = writeBatch(db);
          localCards.forEach(card => {
            const docId = card.id || doc(collection(db, 'dummy')).id;
            batch.set(doc(db, 'users', currentUid, 'cards', docId), { ...card, id: docId });
          });
          await batch.commit();
          localStorage.removeItem('mnemonic_user_cards');
          fetched = localCards;
        }
      }

      setUserCards(fetched);
      localStorage.setItem(CACHE_KEY(currentUid), JSON.stringify(fetched));
      
      const newRev = serverRev || genToken();
      localRevRef.current = newRev;
      localStorage.setItem(REV_KEY(currentUid), newRev);

      if (!serverRev) {
        await setDoc(doc(db, 'users', currentUid, 'meta', 'cards'), { rev: newRev }, { merge: true });
      }
    } catch (e) {
      console.error("전체 동기화 실패:", e);
    }
  }, []);

  useEffect(() => {
    let unsubscribeMeta = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try { await signInAnonymously(auth); } 
        catch (err) { console.error("익명 로그인 실패:", err); setLoading(false); }
        return;
      }

      setIsAnonymous(user.isAnonymous);
      setUserEmail(user.email || '');
      const currentUid = user.uid;
      setUid(currentUid);
      uidRef.current = currentUid;

      const cachedRev = localStorage.getItem(REV_KEY(currentUid));
      const cachedData = localStorage.getItem(CACHE_KEY(currentUid));
      if (cachedRev && cachedData) {
        try {
          setUserCards(JSON.parse(cachedData));
          localRevRef.current = cachedRev;
          setLoading(false);
        } catch(e) {}
      }

      const metaRef = doc(db, 'users', currentUid, 'meta', 'cards');
      unsubscribeMeta = onSnapshot(metaRef, async (metaSnap) => {
        const serverRev = metaSnap.exists() ? metaSnap.data().rev : null;
        
        // 🚨 [여기가 수정된 핵심 로직입니다!] 
        // 로컬 캐시가 아예 없거나(!localRevRef.current), 서버 버전과 다르면 무조건 동기화 실행
        if (!localRevRef.current || serverRev !== localRevRef.current) {
          await fullSync(currentUid, serverRev);
        }
        
        setLoading(false);
      }, (err) => {
        console.error("메타데이터 리스너 오류:", err);
        setLoading(false);
      });
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeMeta) unsubscribeMeta();
    };
  }, [fullSync]);

  const commitOps = useCallback(async (nextCards, buildBatchFunc) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;

    const newRev = genToken();
    localRevRef.current = newRev;
    setUserCards(nextCards);
    localStorage.setItem(CACHE_KEY(currentUid), JSON.stringify(nextCards));
    localStorage.setItem(REV_KEY(currentUid), newRev);

    const ops = buildBatchFunc();
    const CHUNK_SIZE = 400;
    
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      
      chunk.forEach(op => {
        if (op.type === 'set') batch.set(op.ref, op.data, op.options);
        else if (op.type === 'delete') batch.delete(op.ref);
      });

      if (i + CHUNK_SIZE >= ops.length) {
        const metaRef = doc(db, 'users', currentUid, 'meta', 'cards');
        batch.set(metaRef, { rev: newRev }, { merge: true });
      }
      
      await batch.commit();
    }
  }, []);

  const allCards = [...builtinCards, ...userCards];

  const addCard = useCallback(async (card) => {
    if (!uidRef.current) return;
    const docRef = doc(collection(db, 'dummy')); 
    const newCard = { ...card, id: docRef.id };
    const nextCards = [...userCards, newCard];
    
    await commitOps(nextCards, () => [
      { type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', newCard.id), data: newCard }
    ]);
  }, [userCards, commitOps]);

  const addCards = useCallback(async (incoming) => {
    if (!uidRef.current) return 0;
    const existing = [...builtinCards, ...userCards];
    const newCards = incoming.filter((c) => !existing.some((e) => isDuplicate(e, c)));
    if (newCards.length === 0) return 0;

    const cardsToAdd = newCards.map(c => ({ ...c, id: doc(collection(db, 'dummy')).id }));
    const nextCards = [...userCards, ...cardsToAdd];

    await commitOps(nextCards, () => 
      cardsToAdd.map(card => ({
        type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', card.id), data: card
      }))
    );
    return newCards.length;
  }, [userCards, commitOps]);

  const updateCard = useCallback(async (id, updated) => {
    if (!uidRef.current || !id) return;
    const nextCards = userCards.map(c => c.id === id ? { ...c, ...updated } : c);
    
    await commitOps(nextCards, () => [
      { type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', id), data: updated, options: { merge: true } }
    ]);
  }, [userCards, commitOps]);

  const deleteCard = useCallback(async (id) => {
    if (!uidRef.current || !id) return;
    const nextCards = userCards.filter(c => c.id !== id);
    
    await commitOps(nextCards, () => [
      { type: 'delete', ref: doc(db, 'users', uidRef.current, 'cards', id) }
    ]);
  }, [userCards, commitOps]);

  const deleteBy = useCallback(async ({ subject, part }) => {
    if (!uidRef.current) return 0;
    let removed = 0;
    const toDeleteIds = new Set();
    
    userCards.forEach((c) => {
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      if (ms && mp) {
        toDeleteIds.add(c.id);
        removed++;
      }
    });

    if (removed === 0) return 0;
    const nextCards = userCards.filter(c => !toDeleteIds.has(c.id));
    
    await commitOps(nextCards, () => 
      Array.from(toDeleteIds).map(id => ({
        type: 'delete', ref: doc(db, 'users', uidRef.current, 'cards', id)
      }))
    );
    return removed;
  }, [userCards, commitOps]);

  const countBy = useCallback(({ subject, part }) =>
    userCards.filter((c) => {
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      return ms && mp;
    }).length
  , [userCards]);

  const renameFolder = useCallback(async ({ oldSubject, oldPart, newSubject, newPart }) => {
    if (!uidRef.current) return 0;
    let updatedCount = 0;
    const updates = [];

    const nextCards = userCards.map((c) => {
      const matchSub = oldSubject === '전체' || c.subject === oldSubject;
      const matchPart = oldPart === '전체' || c.part === oldPart;
      if (matchSub && matchPart) {
        const updated = { ...c, subject: newSubject || c.subject, part: newPart || c.part };
        updates.push(updated);
        updatedCount++;
        return updated;
      }
      return c;
    });

    if (updatedCount > 0) {
      await commitOps(nextCards, () => 
        updates.map(card => ({
          type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', card.id), data: { subject: card.subject, part: card.part }, options: { merge: true }
        }))
      );
    }
    return updatedCount;
  }, [userCards, commitOps]);

  const deduplicateSelf = useCallback(async () => {
    if (!uidRef.current) return 0;
    let removed = 0;
    const kept = [];
    const toDeleteIds = [];

    userCards.forEach((card) => {
      const isBuiltinDup = builtinCards.some((b) => isDuplicate(b, card));
      const isSelfDup = kept.some((k) => isDuplicate(k, card));
      
      if (isBuiltinDup || isSelfDup) {
        toDeleteIds.push(card.id);
        removed++;
      } else {
        kept.push(card);
      }
    });
    
    if (removed > 0) {
      await commitOps(kept, () => 
        toDeleteIds.map(id => ({
          type: 'delete', ref: doc(db, 'users', uidRef.current, 'cards', id)
        }))
      );
    }
    return removed;
  }, [userCards, commitOps]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(allCards, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `mnemonic_cards_${new Date().toISOString().slice(0,10)}.json`; a.click();
  }, [allCards]);

  const importJSON = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('올바른 JSON 형식이 아닙니다');
        const added = await addCards(data);
        resolve({ added, skipped: data.length - added });
      } catch (err) { reject(err); }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  }), [addCards]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (user && user.isAnonymous) {
        await linkWithPopup(user, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      if (err.code === 'auth/credential-already-in-use') {
        alert("이미 사용 중인 구글 계정입니다. 기존 계정으로 로그인합니다.");
        await signInWithPopup(auth, googleProvider);
      }
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try { await signOut(auth); } catch (err) { console.error("로그아웃 실패:", err); }
  }, []);

  const duplicateCount = (() => {
    const withoutBuiltin = userCards.filter((c) => !builtinCards.some((b) => isDuplicate(b, c)));
    const kept = [];
    withoutBuiltin.forEach(c => { if(!kept.some(k => isDuplicate(k, c))) kept.push(c); });
    return withoutBuiltin.length - kept.length;
  })();

  const subjects = [...new Set(allCards.map((c) => c.subject))];
  const parts = (subject) => [...new Set(allCards.filter((c) => c.subject === subject).map((c) => c.part))];

  return {
    allCards, userCards, builtinCards, loading,
    addCard, addCards, deleteCard, updateCard,
    moveCard: () => {}, reorderCard: () => {}, deleteBy, countBy, renameFolder,
    exportJSON, importJSON, deduplicateSelf, duplicateCount,
    subjects, parts,
    isAnonymous, userEmail, loginWithGoogle, handleLogout
  };
}
