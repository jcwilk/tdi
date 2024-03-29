import { BehaviorSubject, Observable, ReplaySubject, Subject, concatMap, finalize, from, map, of, skip, switchMap, tap } from "rxjs";

export function subscribeUntilFinalized<T>(
  source: Observable<T>,
  subscriber: Subject<T>
) {
  return source.pipe(
    finalize(() => subscriber.complete())
  ).subscribe(subscriber);
}

export function pluckLast<T>(subject: ReplaySubject<T>): T | null {
  let lastValue: T | null = null;
  const subscription = subject.subscribe((value) => {
    lastValue = value;
  });
  subscription.unsubscribe();
  return lastValue;
}

export function pluckAll<T>(replaySubject: ReplaySubject<T>): T[] {
  const values: T[] = [];
  replaySubject.subscribe((value: T) => values.push(value)).unsubscribe();
  return values;
}

export function scanAsync<T, R>(
  accumulator: (acc: R, value: T, index: number) => Promise<R>,
  seed: R
) {
  let index = 0;
  let acc = seed;

  return (source: Observable<T>) =>
    source.pipe(
      concatMap((value) =>
        from(accumulator(acc, value, index++)).pipe(
          map((newAcc) => {
            acc = newAcc;
            return newAcc;
          })
        )
      )
    );
};

export function concatTap<T>(callback: (value: T) => Observable<any>) {
  return concatMap((value: T) => callback(value).pipe(tap(() => {}), () => of(value)));
}

export function switchTap<T>(callback: (value: T) => Observable<any>) {
  return switchMap((value: T) => callback(value).pipe(tap(() => {})));
}

export function observeNew<T>(subject: BehaviorSubject<T>): Observable<T> {
  return subject.asObservable().pipe(skip(1));
}
