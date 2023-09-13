import { Observable, ReplaySubject, Subject, finalize } from "rxjs";

export function subscribeUntilFinalized(
  source: Observable<any>,
  subscriber: Subject<any>
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
