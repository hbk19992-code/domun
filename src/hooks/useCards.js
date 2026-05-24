import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { collection, doc, setDoc, deleteDoc, writeBatch, query, getDocs, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, signOut, linkWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';
import { exportX4Epub, exportX4Txt } from '../utils/x4Export';
import { DEFAULT_TOP_CATEGORY, getTopCategory, matchesTopCategory } from '../utils/classification';

const genToken = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
const CACHE_KEY = (uid) => `cards_cache_${uid}`;
const REV_KEY = (uid) => `cache_rev_${uid}`;
const LAST_CACHE_KEY = 'cards_cache_last';

function readCardsFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCardsCache(key, cards) {
  localStorage.setItem(key, JSON.stringify(cards));
  localStorage.setItem(LAST_CACHE_KEY, JSON.stringify(cards));
}

export function useCards() {
  const [userCards, setUserCards] = useState(() => {
    const last = readCardsFromStorage(LAST_CACHE_KEY);
    return last.length > 0 ? last : readCardsFromStorage('mnemonic_user_cards');
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [uid, setUid] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const localRevRef = useRef(null);
  const uidRef = useRef(null);
  const syncInFlightRef = useRef(false);

  const fullSync = useCallback(async (currentUid, serverRev) => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncError('');
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
      writeCardsCache(CACHE_KEY(currentUid), fetched);
      
      const newRev = serverRev || genToken();
      localRevRef.current = newRev;
      localStorage.setItem(REV_KEY(currentUid), newRev);

      if (!serverRev) {
        await setDoc(doc(db, 'users', currentUid, 'meta', 'cards'), { rev: newRev }, { merge: true });
      }
    } catch (e) {
      console.error("전체 동기화 실패:", e);
      setSyncError('클라우드 동기화가 지연되고 있습니다. 로컬 데이터로 먼저 사용할 수 있습니다.');
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribeMeta = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try { await signInAnonymously(auth); } 
        catch (err) {
          console.error("익명 로그인 실패:", err);
          setSyncError('클라우드 로그인이 지연되고 있습니다. 로컬 데이터로 먼저 사용할 수 있습니다.');
          setLoading(false);
        }
        return;
      }

      setIsAnonymous(user.isAnonymous);
      setUserEmail(user.email || '');
      const currentUid = user.uid;
      setUid(currentUid);
      uidRef.current = currentUid;

      const cachedRev = localStorage.getItem(REV_KEY(currentUid));
      const cachedData = localStorage.getItem(CACHE_KEY(currentUid));
      const hasUserCache = !!(cachedRev && cachedData);
      if (hasUserCache) {
        try {
          const cachedCards = JSON.parse(cachedData);
          if (Array.isArray(cachedCards)) setUserCards(cachedCards);
          localRevRef.current = cachedRev;
          setLoading(false);
        } catch(e) {}
      } else {
        setLoading(false);
        fullSync(currentUid, null);
      }

      const metaRef = doc(db, 'users', currentUid, 'meta', 'cards');
      unsubscribeMeta = onSnapshot(metaRef, (metaSnap) => {
        const serverRev = metaSnap.exists() ? metaSnap.data().rev : null;
        
        if (!localRevRef.current || serverRev !== localRevRef.current) {
          fullSync(currentUid, serverRev);
        } else {
          setSyncing(false);
        }
        
        setLoading(false);
      }, (err) => {
        console.error("메타데이터 리스너 오류:", err);
        setSyncError('클라우드 동기화가 지연되고 있습니다. 로컬 데이터로 먼저 사용할 수 있습니다.');
        setSyncing(false);
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
    if (!currentUid) {
      setUserCards(nextCards);
      writeCardsCache('mnemonic_user_cards', nextCards);
      return;
    }

    const newRev = genToken();
    localRevRef.current = newRev;
    setUserCards(nextCards);
    writeCardsCache(CACHE_KEY(currentUid), nextCards);
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

  const visibleUserCards = useMemo(
    () => userCards.filter((card) => !builtinCards.some((builtin) => isDuplicate(builtin, card))),
    [userCards]
  );

  const allCards = useMemo(
    () => [...builtinCards, ...visibleUserCards],
    [visibleUserCards]
  );

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
    if (!uidRef.current) return { added: 0, updated: 0 };
    const existing = [...builtinCards, ...userCards];
    const newCards = [];
    const topCategoryUpdates = new Map();

    incoming.forEach((card) => {
      const match = existing.find((e) => isDuplicate(e, card));
      if (!match) {
        newCards.push(card);
        existing.push(card);
        return;
      }

      const currentUserCard = userCards.find((c) => c.id && c.id === match.id);
      const incomingTop = getTopCategory(card);
      const currentTop = getTopCategory(match);
      if (currentUserCard && incomingTop !== DEFAULT_TOP_CATEGORY && currentTop === DEFAULT_TOP_CATEGORY) {
        topCategoryUpdates.set(currentUserCard.id, { ...currentUserCard, topCategory: incomingTop });
      }
    });

    const cardsToAdd = newCards.map(c => ({ ...c, id: doc(collection(db, 'dummy')).id }));
    if (cardsToAdd.length === 0 && topCategoryUpdates.size === 0) return { added: 0, updated: 0 };

    const nextCards = [
      ...userCards.map((card) => topCategoryUpdates.get(card.id) || card),
      ...cardsToAdd
    ];

    await commitOps(nextCards, () => [
      ...Array.from(topCategoryUpdates.values()).map(card => ({
        type: 'set',
        ref: doc(db, 'users', uidRef.current, 'cards', card.id),
        data: { topCategory: card.topCategory },
        options: { merge: true }
      })),
      ...cardsToAdd.map(card => ({
        type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', card.id), data: card
      }))
    ]);
    return { added: cardsToAdd.length, updated: topCategoryUpdates.size };
  }, [userCards, commitOps]);

  const updateCard = useCallback(async (id, updated) => {
    if (!uidRef.current || !id) return;
    const nextCards = userCards.map(c => c.id === id ? { ...c, ...updated } : c);
    
    await commitOps(nextCards, () => [
      { type: 'set', ref: doc(db, 'users', uidRef.current, 'cards', id), data: updated, options: { merge: true } }
    ]);
  }, [userCards, commitOps]);

  const updateCardsByIds = useCallback(async (ids, updates) => {
    if (!uidRef.current || !Array.isArray(ids) || ids.length === 0) return 0;
    const patch = Object.fromEntries(
      Object.entries(updates || {}).filter(([, value]) => value !== undefined && value !== null)
    );
    if (Object.keys(patch).length === 0) return 0;

    const targetIds = new Set(ids.filter(Boolean));
    const updatedCards = [];
    const nextCards = userCards.map((card) => {
      if (!targetIds.has(card.id)) return card;
      const updated = { ...card, ...patch };
      updatedCards.push(updated);
      return updated;
    });

    if (updatedCards.length === 0) return 0;

    await commitOps(nextCards, () =>
      updatedCards.map(card => ({
        type: 'set',
        ref: doc(db, 'users', uidRef.current, 'cards', card.id),
        data: patch,
        options: { merge: true }
      }))
    );
    return updatedCards.length;
  }, [userCards, commitOps]);

  const deleteCard = useCallback(async (id) => {
    if (!uidRef.current || !id) return;
    const nextCards = userCards.filter(c => c.id !== id);
    
    await commitOps(nextCards, () => [
      { type: 'delete', ref: doc(db, 'users', uidRef.current, 'cards', id) }
    ]);
  }, [userCards, commitOps]);

  const deleteBy = useCallback(async ({ topCategory, subject, part }) => {
    if (!uidRef.current) return 0;
    let removed = 0;
    const toDeleteIds = new Set();
    
    userCards.forEach((c) => {
      const mt = matchesTopCategory(c, topCategory);
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      if (mt && ms && mp) {
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

  const countBy = useCallback(({ topCategory, subject, part }) =>
    userCards.filter((c) => {
      const mt = matchesTopCategory(c, topCategory);
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      return mt && ms && mp;
    }).length
  , [userCards]);

  const renameFolder = useCallback(async ({ oldTopCategory, oldSubject, oldPart, newTopCategory, newSubject, newPart }) => {
    if (!uidRef.current) return 0;
    let updatedCount = 0;
    const updates = [];

    const nextCards = userCards.map((c) => {
      const matchTop = matchesTopCategory(c, oldTopCategory);
      const matchSub = oldSubject === '전체' || c.subject === oldSubject;
      const matchPart = oldPart === '전체' || c.part === oldPart;
      if (matchTop && matchSub && matchPart) {
        const updated = {
          ...c,
          topCategory: newTopCategory || getTopCategory(c),
          subject: newSubject || c.subject,
          part: newPart || c.part
        };
        updates.push(updated);
        updatedCount++;
        return updated;
      }
      return c;
    });

    if (updatedCount > 0) {
      await commitOps(nextCards, () => 
        updates.map(card => ({
          type: 'set',
          ref: doc(db, 'users', uidRef.current, 'cards', card.id),
          data: { topCategory: card.topCategory, subject: card.subject, part: card.part },
          options: { merge: true }
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

  const exportX4TXT = useCallback((targetCards = allCards, label = '전체') => {
    if (targetCards.length === 0) {
      alert('내보낼 카드가 없습니다.');
      return;
    }
    exportX4Txt(targetCards, label);
  }, [allCards]);

  const exportX4EPUB = useCallback((targetCards = allCards, label = '전체') => {
    if (targetCards.length === 0) {
      alert('내보낼 카드가 없습니다.');
      return;
    }
    exportX4Epub(targetCards, label);
  }, [allCards]);

  const importJSON = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('올바른 JSON 형식이 아닙니다');
        const result = await addCards(data);
        const added = typeof result === 'number' ? result : result.added;
        const updated = typeof result === 'number' ? 0 : result.updated;
        resolve({ added, updated, skipped: data.length - added - updated });
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

  const duplicateCount = useMemo(() => {
    let count = userCards.length - visibleUserCards.length;
    const kept = [];
    visibleUserCards.forEach(c => {
      if (kept.some(k => isDuplicate(k, c))) count += 1;
      else kept.push(c);
    });
    return count;
  }, [userCards, visibleUserCards]);

  const topCategories = useMemo(() => [...new Set(allCards.map((c) => getTopCategory(c)).filter(Boolean))], [allCards]);
  const subjects = useMemo(() => [...new Set(allCards.map((c) => c.subject).filter(Boolean))], [allCards]);
  const subjectsForTop = useCallback(
    (topCategory = '전체') => [...new Set(allCards
      .filter((c) => matchesTopCategory(c, topCategory))
      .map((c) => c.subject)
      .filter(Boolean))],
    [allCards]
  );
  const parts = useCallback(
    (subject, topCategory = '전체') => [...new Set(allCards
      .filter((c) => matchesTopCategory(c, topCategory))
      .filter((c) => c.subject === subject)
      .map((c) => c.part)
      .filter(Boolean))],
    [allCards]
  );

  return {
    allCards, userCards, builtinCards, loading,
    syncing, syncError,
    addCard, addCards, deleteCard, updateCard, updateCardsByIds,
    moveCard: () => {}, reorderCard: () => {}, deleteBy, countBy, renameFolder,
    exportJSON, exportX4TXT, exportX4EPUB, importJSON, deduplicateSelf, duplicateCount,
    topCategories, subjects, subjectsForTop, parts,
    isAnonymous, userEmail, loginWithGoogle, handleLogout
  };
}
