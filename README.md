# lol_mw_icon
script to upload lol icons to mw

## build
install dependencies
```
npm install
```
and then build it
```
npm run build
```

## how2use
entry points:
 - ```/dist/indexes.js``` - update indexes
 - ```/dist/icon.js``` - check + update icons

*q: why dont u put it in scripts? a: do it yourself if want it this much (interrupting npm script isnt fun)*

## required env
 - user - bot login
 - password - bot password
 - realm - fandom realm

## TODO
 - flag out override on outdate

## whats going on ?
evry icon uploaded using schema ```File:Profile-Icons-V1-<id>.<ext>```<br>
evry icon have associated data uloaded in ```Module:Profile-Icons/V1/icon/<id>```<br>
alos there are indexes placed in ```Module:Profile-Icons/V1/index``` - for global index and ```Module:Profile-Icons/V1/index/<name>``` - for any specific index
### content of indexes
global:
```lua
{
    ["<id>"] = <id>,
    --[[ ... ]]
}
```
specific (name):
```lua
{
    ["<name>"] = {
        <id>,
        --[[ ... ]]
    },
    --[[ ... ]]
}
```
### how to find icon using this data
#### using id
- validate id (check it in index)
- load icon data ```local data = require("Module:Profile-Icons/V1/icon/" .. <id>)```
- get icon mime type (icon data alveys contain fields image -> mime ```local mime = data["image"]["mime"]```)
- convert mime to file extention
- using this info cumpute image name ```local imagePath = "File:Profile-Icons-V1-" .. id .. "." .. ext```

#### using name
 - validate name (check it in index)
 - get file id and offset (```local id = index[<name>][<offset>]``` offset in most cases 1, but icons have name collisions, so single name can be resolved into multiple id's)
 - goto 2 step of "using id"
