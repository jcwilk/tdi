import { Observable, ReplaySubject, Subject, finalize } from "rxjs";

export function subscribeUntilFinalized(
  source: Observable<any>,
  subscriber: Subject<any>
) {
  source.pipe(
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
