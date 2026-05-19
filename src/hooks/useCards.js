import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, writeBatch, query, getDocs, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, signOut, linkWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';

// 고유 토큰 생성 함수
const genToken = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

// 캐시 키 헬퍼 함수
const CACHE_KEY = (uid) => `cards_cache_${uid}`;
const REV_KEY = (uid) => `cache_rev_${uid}`;

export function useCards() {
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  // 현재 내 변경사항을 추적하여 불필요한 재동기화를 막기 위한 Ref
  const localRevRef = useRef(null);
  const uidRef = useRef(null); // commitOps에서 클로저 문제 없이 최신 uid 접근

  // 클라우드와 전체 동기화 (최초 1회 또는 다른 기기에서 변경이 감지될 때만 실행)
  const fullSync = useCallback(async (currentUid, serverRev) => {
    try {
      const cardsRef = collection(db, 'users', currentUid, 'cards');
      const snapshot = await getDocs(query(cardsRef));
      let fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

      // [레거시 마이그레이션] 옛날 로컬스토리지 방식 데이터가 남아있다면 클라우드로 이관
      const localRaw = localStorage.getItem('mnemonic_user_cards');
      if (localRaw && fetched.length === 0) {
        const localCards = JSON.parse(localRaw);
        if (localCards.length > 0) {
          const batch = writeBatch(db);
          localCards.forEach(card => {
            const docId = card.id || doc(collection(db, 'dummy')).id;
            batch.set(doc(db, 'users', currentUid, 'cards', docId), { ...card, id: docId });
          });
          // 마이그레이션된 것도 캐시에 저장해야 하므로 일단 커밋
          await batch.commit();
          localStorage.removeItem('mnemonic_user_cards');
          fetched = localCards;
        }
      }

      // 상태 및 캐시 업데이트
      setUserCards(fetched);
      localStorage.setItem(CACHE_KEY(currentUid), JSON.stringify(fetched));
      
      const newRev = serverRev || genToken();
      localRevRef.current = newRev;
      localStorage.setItem(REV_KEY(currentUid), newRev);

      // 만약 메타 문서가 처음이라면 생성
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

      // 앱 로드 즉시 기존 캐시를 확인해 UI부터 보여줌 (체감 속도 향상)
      const cachedRev = localStorage.getItem(REV_KEY(currentUid));
      const cachedData = localStorage.getItem(CACHE_KEY(currentUid));
      if (cachedRev && cachedData) {
        try {
          setUserCards(JSON.parse(cachedData));
          localRevRef.current = cachedRev;
          setLoading(false); // 캐시가 있으면 로딩 해제 후 뒷단에서 확인
        } catch(e) {}
      }

      // 수백 장의 카드 대신, 'meta/cards' 단 1개의 문서만 모니터링하여 변경을 감지합니다.
      const metaRef = doc(db, 'users', currentUid, 'meta', 'cards');
      unsubscribeMeta = onSnapshot(metaRef, async (metaSnap) => {
        const serverRev = metaSnap.exists() ? metaSnap.data().rev : null;
        
        // 서버 버전이 로컬과 다르다면 (다른 기기에서 변경했거나 첫 로그인인 경우) 전체 동기화 실행
        if (serverRev !== localRevRef.current) {
          await fullSync(currentUid, serverRev);
        }
        
        // 캐시가 없었던 유저를 위해 여기서 로딩 완전 해제
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

  // Firestore 배치 처리 및 로컬 캐시 동시 업데이트 헬퍼 (초과 시 400개 단위 분할)
  const commitOps = useCallback(async (nextCards, buildBatchFunc) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;

    // 1. 상태 및 로컬 캐시를 즉시 업데이트하여 반응성 확보
    const newRev = genToken();
    localRevRef.current = newRev; // 내 변경사항임을 표시해 onSnapshot 재호출 방지
    setUserCards(nextCards);
    localStorage.setItem(CACHE_KEY(currentUid), JSON.stringify(nextCards));
    localStorage.setItem(REV_KEY(currentUid), newRev);

    // 2. 콜백으로부터 작업 리스트(operation object)를 받아와 청크 단위(400)로 쪼개어 배치 커밋
    // Firestore limit는 500이지만 안전하게 400 단위로 자릅니다.
    const ops = buildBatchFunc();
    const CHUNK_SIZE = 400;
    
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      
      chunk.forEach(op => {
        if (op.type === 'set') batch.set(op.ref, op.data, op.options);
        else if (op.type === 'delete') batch.delete(op.ref);
      });

      // 마지막 청크에 메타데이터 버전 업데이트를 포함
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
    const docRef = doc(collection(db, 'dummy')); // Auto-ID 생성
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
