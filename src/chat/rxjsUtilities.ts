import { Observable, Subject, finalize } from "rxjs";

export function subscribeUntilFinalized(
  source: Observable<any>,
  subscriber: Subject<any>
) {
  source.pipe(
    finalize(() => subscriber.complete())
  ).subscribe(subscriber);
}
