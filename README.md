# Template for making simple regl single page apps

## Setup

Just make a new repository using this project as a template - https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template

Then go to `Settings` -> `Pages` tab on the left -> Select `gh-pages` from the dropdown under `Branch` and leave the second dropdown as `/ (root)`

If `gh-pages` isn't there yet then reload the page a few times and it should appear. It takes the github action a moment to build the site and put it into the branch. Alternatively, if you check the box for "Include all branches" when copying from the template then it'll probably already be there.

After a short wait you should be able to access USERNAME.github.io/REPONAME and see a julia set which shows your new regl project is ready to hack on!
## How to run

`npm run dev` - run dev server

If you'd like to build under prod mode to test locally:

`npm run build` - build for prod

But this shouldn't be necessary since you can just use Pages!
